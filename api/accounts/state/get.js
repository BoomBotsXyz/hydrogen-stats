// responsible for fetching the state of a pool

const ethers = require("ethers")
const BN = ethers.BigNumber
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
  var { chainID, account } = verifyParams(event["queryStringParameters"])
  var nucleusState = await fetchNucleusState(chainID)
  // todo: possibly fetch external balances
  var internalBalances = nucleusState.internalBalancesByAccount[account] || {}
  var allPoolIDs = Object.keys(nucleusState.pools)
  var ownedPoolIDs = []
  for(let i = 0; i < allPoolIDs.length; ++i) {
    let poolID = allPoolIDs[i]
    if(nucleusState.pools[poolID].owner == account) ownedPoolIDs.push(poolID)
  }
  var accountState = {
    internalBalances,
    poolIDs: ownedPoolIDs
  }
  return JSON.stringify(accountState)
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
