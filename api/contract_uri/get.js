// responsible for returning the uri of a contract

const { s3GetObjectPromise, snsPublishError } = require("./../utils/aws")

// Define headers
const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE"
}

async function handle(event) {
  return '{"name":"Hydrogen Pool Tokens","description":"Hydrogen Pool Tokens represent the ownership of a pool in the Hydrogen Exchange.","image":"https://assets.hydrogendefi.xyz/hydrogen/hpt/base.svg","external_link":"https://hydrogendefi.xyz"}'
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
