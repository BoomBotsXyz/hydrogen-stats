const ethers = require("ethers")
const BN = ethers.BigNumber
const { AddressZero } = ethers.constants
const { readJsonFile } = require("./../utils/misc")
const { HydrogenNucleusHelper } = require("./../utils/HydrogenNucleusHelper")

const ABI_NUCLEUS = readJsonFile("./data/abi/Hydrogen/HydrogenNucleus.json")

function encodeMarketOrderTransaction(params, hops) {
  if(!hops || hops.length == 0) throw new Error("no hops")
  var { version } = params
  if(version == "v1.0.0") {
    return _encodeMarketOrderTransactionV100(params, hops)
  } else if(version == "v1.0.1") {
    return _encodeMarketOrderTransactionV101(params, hops)
  } else {
    throw(`cannot encode market order for version '${version}'`)
  }
}
exports.encodeMarketOrderTransaction = encodeMarketOrderTransaction

function _encodeMarketOrderTransactionV100(params, hops) {
  var { tokenInAddress, tokenOutAddress, amountIn, amountOut } = params
  var userExternalLocation = HydrogenNucleusHelper.LOCATION_FLAG_EXTERNAL_ADDRESS
  var userInternalLocation = HydrogenNucleusHelper.LOCATION_FLAG_INTERNAL_ADDRESS
  var recipientLocation = HydrogenNucleusHelper.LOCATION_FLAG_EXTERNAL_ADDRESS

  var nucleusAddress = "0x1Caba1EaA6F14b94EF732624Db1702eA41b718ff"
  var nucleus = new ethers.Contract(nucleusAddress, ABI_NUCLEUS)
  var nucleusInterface = nucleus.interface

  var gasUsePerMarketOrder = BN.from(185_000)
  // single hop erc20 to erc20 case
  if(hops.length == 1) {
    var hop = hops[0]
    var calldata = nucleusInterface.encodeFunctionData('executeMarketOrder', [
      {
        poolID: hop.poolID,
        tokenA: hop.tokenA,
        tokenB: hop.tokenB,
        amountA: hop.amountAMT,
        amountB: hop.amountBMT,
        locationA: recipientLocation,
        locationB: userExternalLocation,
        flashSwapCallee: AddressZero,
        callbackData: '0x',
      },
    ])
    return {
      txdata: calldata,
      gasUseEstimate: gasUsePerMarketOrder
    }
  }
  // multihop case
  else {
    var txdatas = []
    // input
    txdatas.push(
      nucleusInterface.encodeFunctionData('tokenTransfer', [
        {
          token: tokenInAddress,
          amount: amountIn,
          src: userExternalLocation,
          dst: userInternalLocation,
        },
      ])
    )
    // swaps
    for(const hop of hops) {
      txdatas.push(
        nucleusInterface.encodeFunctionData('executeMarketOrder', [
          {
            poolID: hop.poolID,
            tokenA: hop.tokenA,
            tokenB: hop.tokenB,
            amountA: hop.amountAMT,
            amountB: hop.amountBMT,
            locationA: userInternalLocation,
            locationB: userInternalLocation,
            flashSwapCallee: AddressZero,
            callbackData: '0x',
          },
        ])
      )
    }
    // output
    txdatas.push(
      nucleusInterface.encodeFunctionData('tokenTransfer', [
        {
          token: tokenOutAddress,
          amount: amountOut,
          src: userInternalLocation,
          dst: recipientLocation,
        },
      ])
    )
    // assemble
    var calldata = nucleusInterface.encodeFunctionData('multicall', [txdatas])
    return {
      txdata: calldata,
      gasUseEstimate: gasUsePerMarketOrder.mul(txdatas.length)
    }
  }
}

function _encodeMarketOrderTransactionV101(params, hops) {
  var { tokenInAddress, tokenOutAddress, amountIn, amountOut } = params

  var nucleusAddress = "0x1Caba1EaA6F14b94EF732624Db1702eA41b718ff"
  var nucleus = new ethers.Contract(nucleusAddress, ABI_NUCLEUS)
  var nucleusInterface = nucleus.interface

  var gasUsePerMarketOrder = BN.from(185_000)
  // single hop erc20 to erc20 case
  if(hops.length == 1) {
    var hop = hops[0]
    var calldata = nucleusInterface.encodeFunctionData('executeMarketOrderDstExt', [
      {
        poolID: hop.poolID,
        tokenA: hop.tokenA,
        tokenB: hop.tokenB,
        amountA: hop.amountAMT,
        amountB: hop.amountBMT,
      },
    ])
    return {
      txdata: calldata,
      gasUseEstimate: gasUsePerMarketOrder
    }
  }
  // multihop case
  else {
    var txdatas = []
    // input
    txdatas.push(
      nucleusInterface.encodeFunctionData('tokenTransferIn', [
        {
          token: tokenInAddress,
          amount: amountIn,
        },
      ])
    )
    // swaps
    for(const hop of hops) {
      txdatas.push(
        nucleusInterface.encodeFunctionData('executeMarketOrderDstInt', [
          {
            poolID: hop.poolID,
            tokenA: hop.tokenA,
            tokenB: hop.tokenB,
            amountA: hop.amountAMT,
            amountB: hop.amountBMT,
          },
        ])
      )
    }
    // output
    txdatas.push(
      nucleusInterface.encodeFunctionData('tokenTransferOut', [
        {
          token: tokenOutAddress,
          amount: amountOut,
        },
      ])
    )
    // assemble
    var calldata = nucleusInterface.encodeFunctionData('multicall', [txdatas])
    return {
      txdata: calldata,
      gasUseEstimate: gasUsePerMarketOrder.mul(txdatas.length)
    }
  }
}
