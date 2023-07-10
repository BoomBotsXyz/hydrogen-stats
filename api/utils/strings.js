const ethers = require("ethers")
const BN = ethers.BigNumber
//const { hexlify, zeroPad, hexStripZeros, solidityKeccak256 } = ethers.utils
const hexlify = ethers.utils.hexlify
const zeroPad = ethers.utils.zeroPad
const formatUnits = ethers.utils.formatUnits

// returns a number in its full 32 byte hex representation
function toBytes32(bn) {
  return hexlify(zeroPad(BN.from(bn).toHexString(), 32));
}
exports.toBytes32 = toBytes32

// same as above without leading 0x
function toAbiEncoded(bn) {
  return toBytes32(bn).substring(2);
}
exports.toAbiEncoded = toAbiEncoded

// same as above but a list
function abiEncodeArgs(list) {
  return list.map(toAbiEncoded).join('');
}
exports.abiEncodeArgs = abiEncodeArgs

// print the contract name and address in table format
function logContractAddress(contractName, address) {
  console.log(`| ${rightPad(contractName,28)} | \`${rightPad(address,42)}\` |`)
}
exports.logContractAddress = logContractAddress

// logs a UTC timestamp and a status
function logStatus(status="", timestamp=-1) {
  if(timestamp == -1) timestamp = Math.floor(Date.now()/1000) // optional param, use seconds not ms
  console.log(`${formatTimestamp(timestamp)} ${status}`)
}
exports.logStatus = logStatus

// adds chars to the left of a string
// s=base, l=length, f=filler
function leftPad(s, l, f=' ') {
  let s2 = `${s}`
  while(s2.length < l) s2 = `${f}${s2}`
  return s2
}
exports.leftPad = leftPad

// adds chars to the right of a string
// s=base, l=length, f=filler
function rightPad(s, l, f=' ') {
  let s2 = `${s}`
  while(s2.length < l) s2 = `${s2}${f}`
  return s2
}
exports.rightPad = rightPad

// like ethers.utils.formatUnits()
// except keeps trailing zeros
function formatUnits2(n, dec) {
  var s = formatUnits(n, dec)
  while(s.length - s.indexOf('.') <= dec) s = `${s}0`
  return s
}
exports.formatUnits2 = formatUnits2

// returns a function that formats numbers to given decimals
function formatNumber(params) {
  // formatter function
  function f(n) {
    if(typeof n == "number") n = `${n}`
    var str = `${parseInt(n).toLocaleString()}`
    if(!params || !params.decimals || params.decimals <= 0) return str
    var i = n.indexOf(".")
    var str2 = (i == -1) ? '' : n.substring(i+1)
    str2 = rightPad(str2.substring(0,params.decimals), params.decimals, '0')
    str = `${str}.${str2}`
    return str
  }
  return f
}
exports.formatNumber = formatNumber

// formats a unix timestamp (in seconds) to UTC string representation
// mm:dd:yyyy hh:mm:ss
function formatTimestamp(timestamp) {
  let d = new Date(timestamp * 1000)
  return `${leftPad(d.getUTCMonth()+1,2,"0")}/${leftPad(d.getUTCDate(),2,"0")}/${d.getUTCFullYear()} ${leftPad(d.getUTCHours(),2,"0")}:${leftPad(d.getUTCMinutes(),2,"0")}:${leftPad(d.getUTCSeconds(),2,"0")}`
}
exports.formatTimestamp = formatTimestamp

// converts an integer to a hex string
function intToHex(n) {
  return "0x"+n.toString(16)
}
exports.intToHex = intToHex

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

// given a bignumber, converts it to an integer respecting decimals
// will throw if the number cannot be safely represented as a js number type
function bignumberToNumber(bn, decimals=18) {
  return parseInt(formatUnits(bn, decimals))
}
exports.bignumberToNumber = bignumberToNumber

function formatPPM(ppm) {
  ppm = BN.from(ppm);
  var L = ppm.div(10000).toString();
  var R = ppm.mod(10000).toString();
  while(R.length < 4) R = `0${R}`;
  while(R.length > 1 && R[R.length-1] == "0") R = R.substring(0, R.length-1);
  return `${L}.${R}%`;
}
exports.formatPPM = formatPPM
