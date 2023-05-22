const ethers = require("ethers")
const BN = ethers.BigNumber
const { getAddress } = ethers.utils
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

function verifyAccount(params) {
  // only checks if the account may be valid
  // does not check if the account exists
  var account = params["account"]
  if(!account) throw { name: "InputError", stack: 'account not given' }
  try {
    var account2 = getAddress(account)
    return account2
  } catch(e) {
    throw { name: "InputError", stack: `account '${account}' invalid`}
  }
}

function verifyParams(params) {
  if(!params) throw { name: "InputError", stack: 'params not given' }
  var chainID = verifyChainID(params)
  var account = verifyAccount(params)
  return { chainID, account }
}
exports.verifyParams = verifyParams
