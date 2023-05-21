// responsible for fetching the metadata of an hpt

const ethers = require("ethers")
const BN = ethers.BigNumber
const { s3GetObjectPromise, snsPublishError } = require("./../../utils/aws")
const { getNetworkSettings } = require("./../../utils/getNetworkSettings")
const { fetchNucleusState } = require("./../../tracker/fetchNucleusState")

// Define headers
const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE"
}

function verifyChainID(params) {
  var chainID = params["chainid"] || params["chainId"] || params["chainID"]
  if(!chainID) throw { name: "InputError", stack: 'chainID not given' }
  try {
    var chainID2 = parseInt(chainID)
    getNetworkSettings(chainID2)
    return chainID2
  } catch(e) {
    throw { name: "InputError", stack: `chainID '${chainID}' not supported` }
  }
}

function verifyPoolID(params) {
  // only checks if the poolID may be valid
  // does not check if the poolID exists
  var poolID = params["poolid"] || params["poolId"] || params["poolID"]
  if(!poolID) throw { name: "InputError", stack: 'poolID not given' }
  try {
    var poolID2 = BN.from(poolID)
    if(poolID2.lt(0)) throw ""
    poolID2 = poolID2.toString()
    if(poolID2.length < 4) throw ""
    var poolType = poolID2.substring(poolID2.length-3)
    if(poolType != "001" && poolType != "002") throw ""
    return poolID2
  } catch(e) {
    throw { name: "InputError", stack: `poolID '${poolID}' invalid`}
  }
}

function verifyParams(params) {
  if(!params) throw { name: "InputError", stack: 'params not given' }
  var chainID = verifyChainID(params)
  var poolID = verifyPoolID(params)
  return { chainID, poolID }
}

async function handle(event) {
  var { chainID, poolID } = verifyParams(event["queryStringParameters"])
  var s3Key = `${chainID}/hpt_metadata/${poolID}.json`
  // try to get metadata from cache
  try {
    return await s3GetObjectPromise({ Bucket: "stats.hydrogen.hysland.finance.data", Key: s3Key })
  } catch(e) {}
  // metadata not cached. fetch and cache state
  await fetchNucleusState(chainID)
  // try to get metadata from cache again
  try {
    return await s3GetObjectPromise({ Bucket: "stats.hydrogen.hysland.finance.data", Key: s3Key })
  } catch(e) {}
  // if not cached, token does not exist
  throw { name: "InputError", stack: `poolID ${poolID} does not exist on chain ${chainID}` }
}

exports.handler = async function(event) {
  try {
    var res = await handle(event)
    return {
      statusCode: 200,
      headers: headers,
      body: res
    }
  } catch (e) {
    switch(e.name) {
      case "InputError":
        return {
          statusCode: 400,
          headers: headers,
          body: e.stack
        }
        break
      default:
        await snsPublishError(event, e)
        return {
          statusCode: 500,
          headers: headers,
          body: "internal server error"
        }
    }
  }
}
