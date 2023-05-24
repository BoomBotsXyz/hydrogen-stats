// responsible for keeping cached state up to date

const { fetchNucleusState } = require("./fetchNucleusState")
const { s3GetObjectPromise, snsPublishError } = require("./../utils/aws")

// Define headers
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE"
}

async function tracker() {
  var chainIDs = [80001]
  await Promise.all(chainIDs.map(fetchNucleusState))
}

// Lambda handler
exports.handler = async function(event) {
  try {
    await tracker()
    return {
      statusCode: 200,
      headers: headers
    }
  } catch (e) {
    await snsPublishError(event, e)
    return {
      statusCode: 500,
      headers: headers
    }
  }
}
