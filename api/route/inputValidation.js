const ethers = require("ethers")

const CHAIN_IDS = [8453,84531,80001]//[1,5]
const SWAP_TYPES = ["exactIn", "exactOut"]
const NUCLEUS_VERSIONS = ["v1.0.0", ]
const DEFAULT_VERSION = "v1.0.0"

function verifyParams(inputParams) {
  if(!inputParams) throw({ name: "InputError", stack: "Parameters not given" })
  var [chainID, err1] = verifyChainID(inputParams)
  var [tokenInAddress, err2] = verifyTokenInAddress(inputParams)
  var [tokenOutAddress, err3] = verifyTokenOutAddress(inputParams)
  var [amount, err4] = verifyAmount(inputParams)
  var [swapType, err5] = verifySwapType(inputParams)
  var [v, err6] = verifyVersion(inputParams)
  var errs = [err1,err2,err3,err4,err5,err6].filter(err => !!err)
  if(errs.length > 0) {
    var errStr = errs.join("\n");
    if(errStr.length > 0) throw({ name: "InputError", stack: errStr });
  }
  var params = { chainID, tokenInAddress, tokenOutAddress, amount, swapType, v }
  return params
}
exports.verifyParams = verifyParams

function verifyChainID(inputParams) {
  try {
    var chainID = inputParams["chainid"] || inputParams["chainId"] || inputParams["chainID"]
    if(!chainID) return [undefined, "chainID not given"]
    chainID = parseInt(inputParams["chainID"])
    if(!CHAIN_IDS.includes(chainID)) return [undefined, `chainID '${chainID}' not supported`]
    return [chainID, undefined]
  } catch(e) {
    return [undefined, "chainID could not be verified"]
  }
}

function verifyTokenInAddress(inputParams) {
  try {
    var [tokenInAddress, err] = verifyTokenAddress(inputParams["tokenInAddress"]);
    if(!!err) return [undefined, `tokenInAddress: ${err}`]
    return [tokenInAddress, undefined]
  } catch(e) {
    return [undefined, "tokenInAddress could not be verified"]
  }
}

function verifyTokenOutAddress(inputParams) {
  try {
    var [tokenOutAddress, err] = verifyTokenAddress(inputParams["tokenOutAddress"]);
    if(!!err) return [undefined, `tokenOutAddress: ${err}`]
    return [tokenOutAddress, undefined]
  } catch(e) {
    return [undefined, "tokenOutAddress could not be verified"]
  }
}

function verifyTokenAddress(addr) {
  if(!addr) return [undefined, "address not given"]
  try {
    return [ethers.utils.getAddress(addr), undefined]
  } catch(e) {
    return [undefined, e.toString()]
  }
}

function verifyAmount(inputParams) {
  try {
    var amount = ethers.BigNumber.from(inputParams["amount"])
    if(amount.lte(0)) return [undefined, "amount must be positive"]
    else return [amount, undefined]
  } catch(e) {
    return [undefined, "amount could not be verified"]
  }
}

function verifySwapType(inputParams) {
  try {
    var swapType = inputParams["swapType"]
    if(!SWAP_TYPES.includes(swapType)) return [undefined, `swapType '${swapType}' not supported`]
    return [swapType, undefined]
  } catch(e) {
    return [undefined, "swapType could not be verified"]
  }
}

function verifyVersion(inputParams) {
  try {
    var v = inputParams["v"]
    if(!v) return [DEFAULT_VERSION, undefined]
    if(!NUCLEUS_VERSIONS.includes(v)) return [undefined, `version '${v}' not supported`]
    return [v, undefined]
  } catch(e) {
    return [DEFAULT_VERSION, undefined]
  }
}
