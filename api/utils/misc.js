const ethers = require("ethers")
const fs = require("fs")

// when using JSON.stringify() on a BN or object that contains a BN, returns its string representation
ethers.BigNumber.prototype.toJSON = function toJSON(_key) { return this.toString() };

// returns a promise that resolves after a specified wait time
async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
exports.delay = delay

// returns the result of a given function call
// gracefully handles request timeouts and retries
const MIN_RETRY_DELAY = 10000
const RETRY_BACKOFF_FACTOR = 2
const MAX_RETRY_DELAY = 100000
async function withBackoffRetries(f, retryCount = 7, jitter = 10000) {
  return new Promise(async (resolve, reject) => {
    //await delay(Math.floor(Math.random() * jitter))
    let nextWaitTime = MIN_RETRY_DELAY
    let i = 0
    while (true) {
      try {
        var res = await f()
        resolve(res)
        break
      } catch (error) {
        i++
        var s = error.toString().toLowerCase()
        if(! ( s.includes("timeout") || s.includes("server_error") ) ) {
          reject(error)
          break
        }
        if (i >= retryCount) {
          console.log("timeout. over max retries")
          reject(error)
          break
        }
        console.log("timeout. retrying")
        await delay(nextWaitTime + Math.floor(Math.random() * jitter))
        nextWaitTime = Math.min(MAX_RETRY_DELAY, RETRY_BACKOFF_FACTOR * nextWaitTime)
      }
    }
  })
}
exports.withBackoffRetries = withBackoffRetries

// formats a unix timestamp (in seconds) to UTC string representation
// mm:dd:yyyy hh:mm:ss
function formatTimestamp(timestamp) {
  let d = new Date(timestamp * 1000)
  return `${d.getUTCMonth()+1}/${d.getUTCDate()}/${d.getUTCFullYear()} ${leftZeroPad(d.getUTCHours(),2)}:${leftZeroPad(d.getUTCMinutes(),2)}:${leftZeroPad(d.getUTCSeconds(),2)}`
}
exports.formatTimestamp = formatTimestamp

function leftZeroPad(s, l) {
  let s2 = `${s}`
  while(s2.length < l) s2 = "0" + s2
  return s2
}
exports.leftZeroPad = leftZeroPad

// returns an array of integers starting at start, incrementing, and stopping before stop
function range(start, stop) {
  start = BN.from(start).toNumber()
  stop = BN.from(stop).toNumber()
  let arr = [];
  for(var i = start; i < stop; ++i) {
    arr.push(i);
  }
  return arr;
}
exports.range = range

// sorts BigNumbers ascending
function sortBNs(a, b) {
  if(a.lt(b)) return -1;
  if(a.gt(b)) return 1;
  return 0;
}
exports.sortBNs = sortBNs

// returns the sign of a bignumber
function bnSign(n) {
  let n2 = BN.from(n)
  if(n2.eq(0)) return 0
  else if(n2.gt(0)) return +1
  else return -1
}
exports.bnSign = bnSign

// reads a file
function readFile(filename) {
  return fs.readFileSync(filename).toString()
}
exports.readFile = readFile

// reads a json file and returns it as an object
function readJsonFile(filename) {
  return JSON.parse(readFile(filename))
}
exports.readJsonFile = readJsonFile

// given an array and a mapper function (value => key)
// returns it as a dictionary
// in case two elements map to the same key, keep the first element in array
function arrayToDict(arr, mapper=(x)=>x) {
  let dict = {}
  for(let i = 0; i < arr.length; ++i) {
    let ele = arr[i]
    let key = mapper(ele)
    if(!dict.hasOwnProperty(key)) dict[key] = ele
  }
  return dict
}
exports.arrayToDict = arrayToDict

// given an array that potentially contains duplicate elements
// returns a new array with only one copy of each unique element
// use mapper when elements are complex objects that should not be used as dictionary keys
// in case two elements map to the same key, keep the first element in array
function deduplicateArray(arr, mapper=(x)=>x) {
  return Object.values(arrayToDict(arr, mapper))
}
exports.deduplicateArray = deduplicateArray

// todo: attach to array prototype
function filterYN(f, arr) {
  var y = []
  var n = []
  for(var ele of arr) {
    if(f(ele)) y.push(ele)
    else n.push(ele)
  }
  return [y, n]
}
exports.filterYN = filterYN

// formats a BigNumber into a string representation of a float
// like ethers.utils.formatUnits() except keeps trailing zeros
function formatUnitsFull(amount, decimals=18) {
  var s = amount.toString()
  while(s.length <= decimals) s = `0${s}`
  var i = s.length - decimals
  var s2 = `${s.substring(0,i)}.${s.substring(i,s.length)}`
  return s2
}
exports.formatUnitsFull = formatUnitsFull

function bignumberToNumber(bn, decimals=18) {
  return ethers.utils.formatUnits(bn, decimals)-0
}
exports.bignumberToNumber = bignumberToNumber
