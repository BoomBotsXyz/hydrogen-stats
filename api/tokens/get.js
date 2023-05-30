// responsible for returning a list of tokens and token price data

const { s3GetObjectPromise, snsPublishError } = require("./../utils/aws")
const { getNetworkSettings } = require("./../utils/getNetworkSettings")
const axios = require("axios")

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

function verifyParams(params) {
  if(!params) throw { name: "InputError", stack: 'params not given' }
  var chainID = verifyChainID(params)
  return { chainID }
}

async function handle(event) {
  var { chainID } = verifyParams(event["queryStringParameters"])
  var networkSettings = getNetworkSettings(chainID)
  // fetch tokens from s3
  var s3Key = `${chainID}/tokens.json`
  var tokens = JSON.parse(await s3GetObjectPromise({Bucket: "stats.hydrogen.hysland.finance.data", Key: s3Key}))
  // setup coingecko query
  var coingeckoIDSet = {}
  for(var i = 0; i < tokens.length; i++) {
    if(tokens[i].hasOwnProperty("coingeckoID")) coingeckoIDSet[tokens[i].coingeckoID] = true
  }
  var coingeckoIDs = Object.keys(coingeckoIDSet)
  var result = { tokens, coingeckoData: [] }
  // short circuit
  if(coingeckoIDs.length == 0) return JSON.stringify(result)
  // execute query
  var baseURL = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids="
  var url = `${baseURL}${coingeckoIDs.join(",")}`
  var res = await axios.get(url)
  var data = res.data
  result.coingeckoData = data
  return JSON.stringify(result)
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
