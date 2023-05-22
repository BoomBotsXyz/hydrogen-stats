const ethers = require("ethers")
const BN = ethers.BigNumber
const { getNetworkSettings } = require("./../utils/getNetworkSettings")

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

function verifyPoolID(params) {
  // only checks if the poolID may be valid
  // does not check if the poolID exists
  var poolID = params["poolid"] || params["poolId"] || params["poolID"]
  if(!poolID) throw { name: "InputError", stack: 'poolID not given' }
  try {
    var poolID2 = BN.from(poolID)
    if(poolID2.lt(0)) throw ""
    poolID2 = poolID2.toString()
    if(poolID2.length < 4) throw ""
    var poolType = poolID2.substring(poolID2.length-3)
    if(poolType != "001" && poolType != "002") throw ""
    return poolID2
  } catch(e) {
    throw { name: "InputError", stack: `poolID '${poolID}' invalid`}
  }
}

function verifyParams(params) {
  if(!params) throw { name: "InputError", stack: 'params not given' }
  var chainID = verifyChainID(params)
  var poolID = verifyPoolID(params)
  return { chainID, poolID }
}
exports.verifyParams = verifyParams
