const ethers = require("ethers")
const BN = ethers.BigNumber
const multicall = require("ethers-multicall-hysland-finance")
const axios = require("axios")

const { AddressZero } = ethers.constants

const { withBackoffRetries } = require("./misc")
const { s3GetObjectPromise } = require("./aws")

// gets an ethers provider for a given chainID
async function getProvider(chainID) {
  let providers = JSON.parse(await s3GetObjectPromise({
    Bucket: "stats.hydrogendefi.xyz.data",
    Key: "providers.json"
  }, cache=true))
  if(!Object(providers).hasOwnProperty(chainID)) {
    throw { name: 'UnknownError', stack: `Could not create an ethers provider for chainID '${chainID}'`}
    return
  }
  let provider = providers[chainID]
  return new ethers.providers.JsonRpcProvider(provider.url)
}
exports.getProvider = getProvider;

// gets a multicall provider for a given chainID
async function getMulticallProvider(chainID) {
  var chainNum = chainID - 0
  const prov = await getProvider(chainNum)
  var mcProvider = new multicall.Provider(prov)
  await mcProvider.init()
  if(chainNum == 1313161554) mcProvider._multicallAddress = "0xdc1522872E440cF9cD48E237EAFEfaa5F157Ca1d"
  if(chainNum == 1313161555) mcProvider._multicallAddress = "0x8f81207F59A4f86d68608fF90b259A0927242967"
  if(chainNum == 4002)       mcProvider._multicallAddress = "0x8f81207F59A4f86d68608fF90b259A0927242967"
  if(chainNum == 8453)       mcProvider._multicallAddress = "0xcA11bde05977b3631167028862bE2a173976CA11"
  if(chainNum == 84531)      mcProvider._multicallAddress = "0x13F51B7b96f420b0F7153279f771edAa27d70dF6"
  return mcProvider
}
exports.getMulticallProvider = getMulticallProvider

// fetch a block
async function fetchBlock(provider, blockTag) {
  return new Promise((resolve, reject) => {
    withBackoffRetries(() => provider.getBlock(blockTag)).then(resolve)
  })
}
exports.fetchBlock = fetchBlock

// fetch events that occurred in a contract with the given event name between startBlock and endBlock
async function fetchEvents(contract, filter, startBlock, endBlock) {
  if(endBlock == "latest") endBlock = await contract.provider.getBlockNumber()
  var events = await _fetchEvents(contract, filter, startBlock, endBlock, 0)
  return sortAndDeduplicateEvents(events)
}
exports.fetchEvents = fetchEvents;

// helper for fetchEvents()
async function _fetchEvents(contract, filter, startBlock, endBlock, depth) {
  return new Promise(async (resolve,reject) => {
    try {
      var events = await contract.queryFilter(filter, startBlock, endBlock)
      resolve(events)
      return
    } catch(e) {
      /*
      var s = e.toString();
      if(!s.includes("10K") && !s.includes("1000 results") && !s.includes("statement timeout") && !s.includes("missing response")) {
        reject(e)
        return
      }
      */
      // log response size exceeded. recurse down
      if(startBlock == endBlock) throw("_fetchEvents(): 0 blocks and still error")
      var midBlock = Math.floor((startBlock+endBlock)/2)
      var [left, right] = [ [], [] ]
      if(depth < 8) {
        [left, right] = await Promise.all([ // parallel
          _fetchEvents(contract, filter, startBlock, midBlock, depth+1),
          _fetchEvents(contract, filter, midBlock+1, endBlock, depth+1),
        ])
      } else { // serial
        left = await _fetchEvents(contract, filter, startBlock, midBlock, depth+1)
        right = await _fetchEvents(contract, filter, midBlock+1, endBlock, depth+1)
      }
      var res = left.concat(right)
      resolve(res)
    }
  })
}

function sortAndDeduplicateEvents(events) {
  //var events2 = JSON.parse(JSON.stringify(events))
  var eventDict = {}
  for(var i = 0; i < events.length; i++) {
    var event = events[i]
    if(event.logIndex >= 10000) throw("logIndex >= 10000")
    var key = event.blockNumber*10000 + event.logIndex
    eventDict[key] = event
  }
  var keys = Object.keys(eventDict).sort()
  return keys.map(key => eventDict[key])
}
exports.sortAndDeduplicateEvents = sortAndDeduplicateEvents

// returns true if code is deployed at the given address and block
// returns false if the address is invalid or no code was deployed yet
async function isDeployed(provider, address, blockTag="latest") {
  try {
    // safety checks
    if(address === undefined || address === null) return false;
    if(address.length !== 42) return false;
    if(address === AddressZero) return false;
    if((await provider.getCode(address, blockTag)).length <= 2) return false;
    return true;
  } catch (e) {
    if(e.toString().includes("account aurora does not exist while viewing")) return false; // handle aurora idiosyncracies
    else throw e;
  }
}
exports.isDeployed = isDeployed

// use a binary search to determine the block in which a contract was deployed to the given address.
// returns -1 if the contract has not been deployed yet
// may fail if self destructed
async function findDeployBlock(provider, address) {
  // part 0: setup, checks
  let R = await provider.getBlockNumber();
  if(!(await isDeployed(provider, address, R))) return -1;
  // part 1: it is likely that the nucleus was deployed recently
  // use a square linear search to efficiently find a lower block number bound
  let L;
  for(let blocksBack = 1; ; ) {
    L = R - blocksBack;
    // is deployed, keep iterating
    if(await isDeployed(provider, address, L)) {
      blocksBack *= 2;
      // if out of bounds, check edge
      if(blocksBack > R) {
        if(await isDeployed(provider, address, 0)) return 0;
        else {
          L = 1;
          break;
        }
      }
    }
    // is not deployed, terminate
    else {
      break;
    }
  }
  // part 2: binary search
  while(L < R-1) {
    let M = Math.floor((L+R)/2);
    if(await isDeployed(provider, address, M)) R = M;
    else L = M;
  }
  // part 3: checks
  let b1 = await isDeployed(provider, address, R-1);
  let b2 = await isDeployed(provider, address, R);
  if(b1 || !b2) throw new Error("Error in findDeployBlock(): did not converge properly");
  return R;
}
exports.findDeployBlock = findDeployBlock

async function multicallChunked(mcProvider, calls, blockTag="latest", chunkSize=25) {
  if(blockTag == "latest") blockTag = await mcProvider._provider.getBlockNumber()
  // break into chunks
  var chunks = []
  for(var i = 0; i < calls.length; i += chunkSize) {
    var chunk = []
    for(var j = 0; j < chunkSize && i+j < calls.length; ++j) {
      chunk.push(calls[i+j])
    }
    chunks.push(chunk)
  }
  // parallel call each chunk
  var res1 = await Promise.all(chunks.map(chunk => withBackoffRetries(() => mcProvider.all(chunk, {blockTag:blockTag,gasLimit:30000000}))))
  // reassemble
  var res2 = []
  for(var i = 0; i < res1.length; ++i) {
    for(var j = 0; j < res1[i].length; ++j) {
      res2.push(res1[i][j])
    }
  }
  return res2
}
exports.multicallChunked = multicallChunked

async function multicallChunkedDict(mcProvider, callsDict, blockTag="latest", chunkSize=25) {
  // transform dict to arr
  let keys = Object.keys(callsDict).sort()
  let callsArr = []
  for(let i = 0; i < keys.length; ++i) callsArr.push(callsDict[keys[i]])
  // call
  let resultsArr = await multicallChunked(mcProvider, callsArr, blockTag, chunkSize)
  // transform arr to dict
  let resultsDict = {}
  for(let i = 0; i < keys.length; ++i) resultsDict[keys[i]] = resultsArr[i]
  // return
  return resultsDict
}
exports.multicallChunkedDict = multicallChunkedDict

async function axiosGet(url) {
  try {
    var res = await axios.get(url)
    var data = res.data
    return data
  } catch(e) {
    throw new Error(`Axios was unable to fetch '${url}'\n${e.toString()}`)
  }
}
exports.axiosGet = axiosGet
