// responsible for fetching the events affecting a pool

const ethers = require("ethers")
const BN = ethers.BigNumber
const { deduplicateArray } = require("./../../utils/misc")
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

function eventAffectsPool(event, poolID) {
  if(event.event === "TokensTransferred") {
    let from = event.args[1]
    let to = event.args[2]
    function isPool(location) {
      let locationType = parseInt(location.substring(0,4))
      if(locationType === 1 || locationType === 2) {
        return false
      } else if(locationType === 3) {
        let eventPoolID = BN.from(`0x${location.substring(4,66)}`).toString()
        return poolID == eventPoolID
      } else {
        errors.push(`Error processing transaction=${event.transactionHash} logIndex=${event.logIndex} TokensTransferred(from=${from}, to=${to}). Invalid location type '${locationType}'`)
      }
    }
    return ( isPool(from) || isPool(to) )
  } else if(event.event === "PoolCreated") {
    let eventPoolID = event.args[0]
    return poolID == eventPoolID
  } else if(event.event === "Transfer") {
    let eventPoolID = event.args[2]
    return poolID == eventPoolID
  } else if(event.event === "TradeRequestUpdated") {
    let eventPoolID = event.args[0]
    return poolID == eventPoolID
  } else if(event.event === "Approval") {
    let eventPoolID = event.args[2]
    return poolID == eventPoolID
  } else if(event.event === "MarketOrderExecuted") {
    let eventPoolID = event.args[0]
    return poolID == eventPoolID
  }
  return false
}

async function handle(event) {
  var { chainID, poolID } = verifyParams(event["queryStringParameters"])
  let nucleusState = await fetchNucleusState(chainID)
  if(!nucleusState.pools.hasOwnProperty(poolID)) throw { name: "InputError", stack: `poolID ${poolID} does not exist on chain ${chainID}` }
  let events = JSON.parse(await s3GetObjectPromise({ Bucket: "stats.hydrogen.hysland.finance.data", Key: `${chainID}/events.json` }))
  let events2 = events.events.filter(event2 => eventAffectsPool(event2, poolID))
  let blockNumbers = deduplicateArray(events2.map(event => event.blockNumber))
  let blockTimestamps = {}
  for(let i = 0; i < blockNumbers.length; ++i) {
    let blockNumber = blockNumbers[i]
    blockTimestamps[blockNumber] = events.blockTimestamps[blockNumber]
  }
  let events3 = {
    events: events2,
    blockTimestamps
  }
  return JSON.stringify(events3)
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
