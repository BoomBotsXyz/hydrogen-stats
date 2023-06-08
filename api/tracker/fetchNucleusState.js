const ethers = require("ethers")
const BN = ethers.BigNumber
const { AddressZero } = ethers.constants
const { getAddress } = ethers.utils
const multicall = require("ethers-multicall-hysland-finance")
const { range, sortBNs, readJsonFile, deduplicateArray } = require("./../utils/misc")
const { s3GetObjectPromise, s3PutObjectPromise, snsPublishError } = require("./../utils/aws")
const { getProvider, getMulticallProvider, multicallChunked, fetchEvents, findDeployBlock, sortAndDeduplicateEvents } = require("./../utils/network")
const { getNetworkSettings } = require("./../utils/getNetworkSettings")
const { storePool } = require("./../pools/storePool")

const ABI_NUCLEUS = readJsonFile("./data/abi/Hydrogen/HydrogenNucleus.json")
const ABI_ERC20 = readJsonFile("./data/abi/other/ERC20.json")

const statsBucket = 'stats.hydrogendefi.xyz.data'
const statsCacheBucket = 'stats-cdn.hydrogendefi.xyz'

async function fetchNucleusState(chainID) {
  // setup
  var s3KeyState = `${chainID}/state.json`
  var s3KeyEvents = `${chainID}/events.json`
  var s3KeyTokens = `${chainID}/tokens.json`
  var state = JSON.parse(await s3GetObjectPromise({ Bucket: statsBucket, Key: s3KeyState }))
  var mcProvider = await getMulticallProvider(chainID)
  var provider = mcProvider._provider
  var networkSettings = getNetworkSettings(chainID)
  var latestBlock = (await provider.getBlockNumber()) - networkSettings.confirmations
  var nucleus = new ethers.Contract(state.nucleusAddress, ABI_NUCLEUS, provider)
  //var nucleusMC = new multicall.Contract(state.nucleusAddress, ABI_NUCLEUS)
  // find deploy block
  if(state.deployBlock === -1) {
    state.deployBlock = await findDeployBlock(provider, nucleus.address)
    state.lastScannedBlock = state.deployBlock - 1
  }
  // scan for new events
  if(latestBlock > state.lastScannedBlock) {
    var eventFilter = { address: nucleus.address, topics: [] }
    var newEvents = await fetchEvents(nucleus, eventFilter, state.lastScannedBlock+1, latestBlock)
    // if new events to process
    if(newEvents.length > 0) {
      state.lastScannedBlock = latestBlock
      state = await rebuildState(state, newEvents)
    }
    // if there were no events to process
    else {
      // debounce unnecessary writes
      var numBlocksScanned = latestBlock - state.lastScannedBlock
      if(numBlocksScanned >= networkSettings.minScanWriteBlocks) {
        // write to s3
        state.lastScannedBlock = latestBlock
        await s3PutObjectPromise({ Bucket: statsBucket, Key: s3KeyState, Body: JSON.stringify(state), ContentType: "application/json" })
      }
    }
  }
  return state


  // helper functions
  // using this current setup with aws lambda, its possible for the stored state and events to get out of sync
  // when in doubt, use events as source of truth

  // purge the current state and rebuild it by parsing events
  // writes new data to s3
  async function rebuildState(state, newEvents) {
    var [eventsData, tokensData] = await Promise.all([
      s3GetObjectPromise({ Bucket: statsBucket, Key: s3KeyEvents }).then(JSON.parse),
      s3GetObjectPromise({ Bucket: statsCacheBucket, Key: s3KeyTokens }).then(JSON.parse),
    ])
    var knownTokens = {}
    for(var i = 0; i < tokensData.length; i++) knownTokens[tokensData[i].address] = true
    var newBlockNumbers = deduplicateArray(newEvents.map(event => event.blockNumber))
    var timestamps = await Promise.all(newBlockNumbers.map(num => provider.getBlock(num).then((block) => block.timestamp)))
    for(var i = 0; i < newBlockNumbers.length; ++i) {
      eventsData.blockTimestamps[newBlockNumbers[i]] = timestamps[i]
    }
    var allEvents = sortAndDeduplicateEvents(JSON.parse(JSON.stringify([...eventsData.events, ...newEvents])))
    eventsData.events = allEvents
    // purge state
    var knownPoolIDs = JSON.parse(JSON.stringify(state.pools))
    state.internalBalancesSum = {}
    state.internalBalancesByAccount = {}
    state.internalBalancesByPool = {}
    state.pools = {}
    state.swapFees = {}
    state.flashLoanFees = {}
    state.contractOwner = ""
    state.contractOwnerPending = ""
    state.baseURI = ""
    state.contractURI = ""
    // rebuild state
    var newPoolIDs = []
    var tokenSet = {}
    // helper functions
    function modifyBalance(token, location, amount) {
      var locationType = parseInt(location.substring(0,4))
      if(locationType === 1) {
        // don't track external balances
      } else if(locationType === 2) {
        if(location.substring(4, 26) != "0000000000000000000000") {
          errors.push(`Error processing transaction=${event.transactionHash} logIndex=${event.logIndex} TokensTransferred(token=${token}, amount=${amount}, from=${from}, to=${to}). Invalid location '${location}'`)
          return
        }
        var address = getAddress(`0x${location.substring(26,66)}`)
        checkNonNullTokenBalanceAtAccount(token, address)
        state.internalBalancesByAccount[address][token] = BN.from(state.internalBalancesByAccount[address][token]).add(amount).toString()
        state.internalBalancesSum[token] = BN.from(state.internalBalancesSum[token]).add(amount).toString()
      } else if(locationType === 3) {
        var poolID = BN.from(`0x${location.substring(4,66)}`).toString()
        checkNonNullTokenBalanceAtPool(token, poolID)
        state.internalBalancesByPool[poolID][token] = BN.from(state.internalBalancesByPool[poolID][token]).add(amount).toString()
        state.internalBalancesSum[token] = BN.from(state.internalBalancesSum[token]).add(amount).toString()
      } else {
        errors.push(`Error processing transaction=${event.transactionHash} logIndex=${event.logIndex} TokensTransferred(token=${token}, amount=${amount}, from=${from}, to=${to}). Invalid location type '${locationType}'`)
      }
    }
    function checkNonNullTokenBalanceAtSum(token) {
      if(!state.internalBalancesSum.hasOwnProperty(token)) state.internalBalancesSum[token] = "0"
    }
    function checkNonNullTokenBalanceAtAccount(token, account) {
      if(!state.internalBalancesByAccount.hasOwnProperty(account)) state.internalBalancesByAccount[account] = {}
      if(!state.internalBalancesByAccount[account].hasOwnProperty(token)) state.internalBalancesByAccount[account][token] = "0"
      checkNonNullTokenBalanceAtSum(token)
    }
    function checkNonNullTokenBalanceAtPool(token, poolID) {
      if(!state.internalBalancesByPool.hasOwnProperty(poolID)) state.internalBalancesByPool[poolID] = {}
      if(!state.internalBalancesByPool[poolID].hasOwnProperty(token)) state.internalBalancesByPool[poolID][token] = "0"
      checkNonNullTokenBalanceAtSum(token)
    }
    function eventsLte(a, b) {
      if(a.blockNumber < b.blockNumber) return true
      if(a.blockNumber > b.blockNumber) return false
      if(a.logIndex <= b.logIndex) return true
      return false
    }
    // process events
    for(var i = 0; i < allEvents.length; i++) {
      var event = allEvents[i]
      //if(eventsData.events.length > 0 && eventsLte(newEvents[i], eventsData.events[eventsData.events.length-1])) continue // double processing
      //eventsData.events.push(event)
      if(event.event === "OwnershipTransferStarted") {
        var newOwner = event.args[1]
        state.contractOwnerPending = event.args.newOwner
      } else if(event.event === "OwnershipTransferred") {
        var newOwner = event.args[1]
        state.contractOwner = newOwner
      } else if(event.event === "BaseURISet") {
        state.baseURI = event.args[0]
      } else if(event.event === "ContractURISet") {
        state.contractURI = event.args[0]
      } else if(event.event === "SwapFeeSetForPair") {
        var [tokenA, tokenB, feePPM, receiverLocation] = event.args
        if(!state.swapFees.hasOwnProperty(tokenA)) state.swapFees[tokenA] = {}
        state.swapFees[tokenA][tokenB] = { feePPM: feePPM.toString(), receiverLocation }
      } else if(event.event === "FlashLoanFeeSetForToken") {
        var [token, feePPM, receiverLocation] = event.args
        state.flashLoanFees[token] = { feePPM: feePPM.toString(), receiverLocation }
      } else if(event.event === "TokensTransferred") {
        var [token, from, to, amount] = event.args
        var amountBN = BN.from(amount)
        tokenSet[token] = true
        modifyBalance(token, from, amountBN.mul(-1))
        modifyBalance(token, to, amountBN)
      } else if(event.event === "PoolCreated") {
        var poolID = event.args[0].toString()
        if(!knownPoolIDs.hasOwnProperty(poolID)) newPoolIDs.push(poolID)
        state.pools[poolID] = {
          poolID: poolID,
          owner: AddressZero,
          tradeRequests: {}
        }
        if(!state.internalBalancesByPool.hasOwnProperty(poolID)) state.internalBalancesByPool[poolID] = {}
      } else if(event.event === "Transfer") {
        var [from, to, poolID] = event.args
        state.pools[poolID.toString()].owner = to
      } else if(event.event === "TradeRequestUpdated") {
        var [poolID, tokenA, tokenB, exchangeRate, locationB] = event.args
        tokenSet[tokenA] = true
        tokenSet[tokenB] = true
        poolID = poolID.toString()
        if(!state.pools[poolID].tradeRequests.hasOwnProperty(tokenA)) state.pools[poolID].tradeRequests[tokenA] = {}
        state.pools[poolID].tradeRequests[tokenA][tokenB] = { exchangeRate, locationB }
        checkNonNullTokenBalanceAtPool(tokenA, poolID)
        checkNonNullTokenBalanceAtPool(tokenB, poolID)
      } else if(event.event === "Approval") {
        // don't track approvals
      } else if(event.event === "ApprovalForAll") {
        // don't track approvals
      } else if(event.event === "MarketOrderExecuted") {
        // key values are tracked in related TokensTransferred events. nothing to do here
      } else {
        errors.push(`Error processing transaction=${event.transactionHash} logIndex=${event.logIndex}. Unknown event ${event.event}`)
      }
    }
    // write to s3
    var promises = newPoolIDs.map(poolID => storePool(chainID, state.nucleusAddress, poolID))
    promises.push(s3PutObjectPromise({ Bucket: statsBucket, Key: s3KeyState, Body: JSON.stringify(state), ContentType: "application/json" }))
    promises.push(s3PutObjectPromise({ Bucket: statsBucket, Key: s3KeyEvents, Body: JSON.stringify(eventsData), ContentType: "application/json" }))
    // handle tokens
    var missingTokens = []
    var addrs = Object.keys(tokenSet)
    for(var i = 0; i < addrs.length; i++) {
      if(!knownTokens.hasOwnProperty(addrs[i])) missingTokens.push(addrs[i])
    }
    if(missingTokens.length > 0) {
      var metadatas = await Promise.all(missingTokens.map(getTokenMetadata))
      for(var i = 0; i < missingTokens.length; i++) {
        var {name, symbol, decimals} = metadatas[i]
        tokensData.push({
          name, symbol, decimals, chainID,
          "address": missingTokens[i],
          "status": "unverified"
        })
      }
      promises.push(s3PutObjectPromise({ Bucket: statsCacheBucket, Key: s3KeyTokens, Body: JSON.stringify(tokensData), ContentType: "application/json" }))
    }
    // flush promises
    await Promise.all(promises)
    return state
  }

  async function getTokenMetadata(addr) {
    var token = new ethers.Contract(addr, ABI_ERC20, provider)
    var [name, symbol, decimals] = await Promise.all([
      tryGet(async () => token.name(), "unknown"),
      tryGet(async () => token.symbol(), "unknown"),
      tryGet(async () => token.decimals(), 0),
    ])
    return {name, symbol, decimals}
  }

  async function tryGet(f, d) {
    try {
      return await f()
    } catch(e) {
      return d
    }
  }

}
exports.fetchNucleusState = fetchNucleusState
