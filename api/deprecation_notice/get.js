// responsible for alerting users of deprecation

const { s3GetObjectPromise, snsPublishError } = require("./../utils/aws")

// Define headers
const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE"
}

// todo: s3
const currentAddresses = {
  "80001": "0xd2174BfC96C96608C2EC7Bd8b5919f9e3603d37f",
  "84531": "0xfE4d3341B87e106fD718f71B71c5430082f01836"
}

async function handle(event) {
  var metadata = { description: `This contract has been deprecated. Use the new contract at ${JSON.stringify(currentAddresses)}` }
  try {
    var params = event["queryStringParameters"]
    var chainID = params["chainid"] || params["chainId"] || params["chainID"]
    if(!!chainID && currentAddresses.hasOwnProperty(chainID)) {
      metadata = { description: `This contract has been deprecated. Use the new contract at ${currentAddresses[chainID]}` }
    }
  } catch(e) {}
  metadata = {
    ...metadata,
    "external_url": ``,
    "image": `https://assets.hysland.finance/deprecated.png`,
    "name": `deprecated`,
    "attributes": []
  }
  return JSON.stringify(metadata)
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
