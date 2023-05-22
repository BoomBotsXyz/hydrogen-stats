// responsible for fetching the state of a pool

const ethers = require("ethers")
const BN = ethers.BigNumber
const { getAddress } = ethers.utils
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

// its not exactly straightforward to say if an event affects an account or not due to the degrees of separation
// eg if an event affects a pool, does it also affect the owner of the pool?
// to keep this function simple we say no
function eventAffectsAccount(event, account) {
  if(event.event === "TokensTransferred") {
    let from = event.args[1]
    let to = event.args[2]
    function isAccount(location) {
      let locationType = parseInt(location.substring(0,4))
      if(locationType === 1 || locationType === 2) {
        if(location.substring(4, 26) != "0000000000000000000000") errors.push(`Error processing transaction=${event.transactionHash} logIndex=${event.logIndex} TokensTransferred(from=${from}, to=${to}). Invalid location type '${locationType}'`)
        let eventAccount = getAddress(`0x${location.substring(26,66)}`)
        return account == eventAccount
      } else if(locationType === 3) {
        return false
      } else {
        errors.push(`Error processing transaction=${event.transactionHash} logIndex=${event.logIndex} TokensTransferred(from=${from}, to=${to}). Invalid location type '${locationType}'`)
      }
    }
    return ( isAccount(from) || isAccount(to) )
  } else if(event.event === "PoolCreated") {
    let eventAccount = event.args[0]
    return account == eventAccount
  } else if(event.event === "Transfer") {
    let eventAccount = event.args[2]
    return account == eventAccount
  } else if(event.event === "TradeRequestUpdated") {
    let eventAccount = event.args[0]
    return account == eventAccount
  } else if(event.event === "ApprovalForAll") {
    return ( (account == event.args[0]) || (account == event.args[1]) )
  }
  return false
}

async function handle(event) {
  var { chainID, account } = verifyParams(event["queryStringParameters"])
  await fetchNucleusState(chainID)
  let events = JSON.parse(await s3GetObjectPromise({ Bucket: "stats.hydrogen.hysland.finance.data", Key: `${chainID}/events.json` }))
  let events2 = events.events.filter(event2 => eventAffectsAccount(event2, account))
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
