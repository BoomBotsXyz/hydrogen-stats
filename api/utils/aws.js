// Load the AWS SDK for Node.js
const AWS = require("aws-sdk")
// Set region
AWS.config.update({region: "us-west-2"})
// Create S3 service
const S3 = new AWS.S3({apiVersion: "2006-03-01"})
exports.AWS = AWS
exports.S3 = S3

var s3_cache = {}

// retrieves an object from S3 with optional caching
// returns a promise representing the request
async function s3GetObjectPromise(params, cache=false) {
  return new Promise((resolve,reject) => {
    try {
      if(cache &&
        Object.keys(s3_cache).includes(params["Bucket"]) &&
        Object.keys(s3_cache[params["Bucket"]]).includes(params["Key"])
      ) resolve(s3_cache[params["Bucket"]][params["Key"]])
      S3.getObject(params, (err,data) => {
        if(err) {
          err.stack = `Could not S3 get ${JSON.stringify(params)}\n${err.stack}`
          reject(err)
        } else {
          var res = data["Body"].toString()
          if(!Object.keys(s3_cache).includes(params["Bucket"])) s3_cache[params["Bucket"]] = {}
          s3_cache[params["Bucket"]][params["Key"]] = res
          resolve(res)
        }
      })
    } catch(err) {
      err.stack = `Could not S3 get ${JSON.stringify(params)}\n${err.stack}`
      reject(err)
    }
  })
}
exports.s3GetObjectPromise = s3GetObjectPromise

// puts an object into S3
// returns a promise representing the request
async function s3PutObjectPromise(params) {
  return new Promise((resolve,reject) => {
    try {
      S3.putObject(params, (err,data) => {
        if(err) {
          var params2 = { Bucket: params.Bucket, Key: params.Key }
          err.stack = `Could not S3 put ${JSON.stringify(params2)}\n${err.stack}`
          reject(err)
        } else resolve(data)
      })
    } catch(e) {
      var params2 = { Bucket: params.Bucket, Key: params.Key }
      err.stack = `Could not S3 put ${JSON.stringify(params2)}\n${err.stack}`
      reject(err)
    }
  })
}
exports.s3PutObjectPromise = s3PutObjectPromise

// publishes a message to SNS
// returns a promise representing the request
async function snsPublishMessage(msg) {
  var params = {
    Message: msg,
    TopicArn: "arn:aws:sns:us-west-2:776862011846:HydrogenStatsSnsTopic"
  }
  return new AWS.SNS({apiVersion: "2010-03-31"}).publish(params).promise()
}
exports.snsPublishMessage = snsPublishMessage

// formats an error message then publishes it to SNS
// returns a promise representing the request
async function snsPublishError(event, err) {
  var eventString = " <unknown>"
  try {
    eventString = `\n${event["headers"]["X-Forwarded-Proto"]}://${event["headers"]["Host"]}${event["path"]} params=${JSON.stringify(event["queryStringParameters"])}`
  } catch(e) {}
  var errMsg = err.stack || err.toString()
  var msg = `The following error occurred in the hydrogen-stats api${eventString} :\n${errMsg}`
  return snsPublishMessage(msg)
}
exports.snsPublishError = snsPublishError
