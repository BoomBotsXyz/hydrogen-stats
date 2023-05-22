// responsible for fetching the state of a pool

const { s3GetObjectPromise, snsPublishError } = require("./../../utils/aws")
const { fetchNucleusState } = require("./../../tracker/fetchNucleusState")
const { verifyParams } = require("./../verifyParams")

// Define headers
const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE"
}

async function handle(event) {
  var { chainID, poolID } = verifyParams(event["queryStringParameters"])
  var nucleusState = await fetchNucleusState(chainID)
  if(!nucleusState.pools.hasOwnProperty(poolID)) throw { name: "InputError", stack: `poolID ${poolID} does not exist on chain ${chainID}` }
  var poolState = {
    owner: nucleusState.pools[poolID].owner,
    tokens: nucleusState.internalBalancesByPool[poolID] || {},
    tradeRequests: nucleusState.pools[poolID].tradeRequests
  }
  return JSON.stringify(poolState)
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
