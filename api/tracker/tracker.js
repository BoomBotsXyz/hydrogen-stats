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
  await Promise.all([
    fetchNucleusState(8453, "v1.0.1"),
    fetchNucleusState(84531, "v1.0.1"),
    fetchNucleusState(80001, "v1.0.1"),
  ])
  await Promise.all([
    fetchNucleusState(8453, "v1.0.0"),
    fetchNucleusState(84531, "v1.0.0"),
    fetchNucleusState(80001, "v1.0.0"),
  ])
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
