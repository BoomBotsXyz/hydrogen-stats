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

function verifyVersion(params) {
  var defaultVersion = "v1.0.1"
  var allowedVersions = {
    "v1.0.0": true,
    "v1.0.1": true,
  }
  var versionRemap = {
    "1.0.0": "v1.0.0",
    "1.0.1": "v1.0.1",
    "V1.0.0": "v1.0.0",
    "V1.0.1": "v1.0.1",
    "100": "v1.0.0",
    "101": "v1.0.1",
    "v100": "v1.0.0",
    "v101": "v1.0.1",
    "V100": "v1.0.0",
    "V101": "v1.0.1",
  }
  var version = params["v"] || params["version"]
  version = versionRemap[version] || version
  if(!version) return defaultVersion
  if(!allowedVersions[version]) {
    throw { name: "InputError", stack: `version '${version}' not supported`}
  }
  return version
}

function verifyParams(params) {
  if(!params) throw { name: "InputError", stack: 'params not given' }
  var chainID = verifyChainID(params)
  var version = verifyVersion(params)
  return { chainID, version }
}
exports.verifyParams = verifyParams
