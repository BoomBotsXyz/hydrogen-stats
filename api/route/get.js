const ethers = require("ethers")
const BN = ethers.BigNumber
const { WeiPerEther, MaxUint256, AddressZero, Zero } = ethers.constants
const { formatUnits } = ethers.utils
const multicall = require("ethers-multicall-hysland-finance")
const fs = require("fs")
const axios = require("axios")
const { withBackoffRetries } = require("./../utils/misc")
const { s3GetObjectPromise, s3PutObjectPromise, snsPublishError } = require("./../utils/aws")
const { getProvider, getMulticallProvider, multicallChunkedDict } = require("./../utils/network")
const { verifyParams } = require("./inputValidation")
const { fetchNucleusState } = require("./../tracker/fetchNucleusState")
//const { getTradeRequestsByTokens } = require("./getTradeRequestsByTokens")
//const { adjustNucleusState } = require("./adjustNucleusState")
const { findPaths } = require("./findPaths")
const { getTokensByAddress } = require("./../utils/getTokens")
const { oneToken, fetchCurrentEthPrice } = require("./../utils/price")
/*
const { getGraph } = require("./../utils/GraphLoader")
const { selectBestPath } = require("./../utils/PathHelper")
const { createPoolDataProvider } = require("./../utils/PoolDataProvider")
*/
// Define headers
const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE"
}

async function route(params) {
  params = verifyParams(params)
  // todo: remove this. temp override to support true weth
  if(params.tokenInAddress == "0x4200000000000000000000000000000000000006") params.tokenInAddress = "0xEa0B5E9AFa37C1cA61779deAB8527eAE62b30367"
  if(params.tokenOutAddress == "0x4200000000000000000000000000000000000006") params.tokenOutAddress = "0xEa0B5E9AFa37C1cA61779deAB8527eAE62b30367"

  var { chainID, tokenInAddress, tokenOutAddress, amount, swapType } = params

  //var res = `Received params: ${JSON.stringify(params, undefined, 2)}`
  //return res
  /*
  // step 1: setup
  // fetch state
  var url = `https://stats.hydrogendefi.xyz/state/?chainID=${chainID}`
  var nucleusState = (await axios.get(url)).data
  //var tradeRequestsByTokens = getTradeRequestsByTokens(nucleusState)
  // vars
  var paths = []
  var amountLeft = amount
  // step 2: search
  while(amountLeft.gt(0)) {
    var maxAmount = amountLeft
    var nextPath = findOptimalPath(nucleusState, tokenInAddress, tokenOutAddress, maxAmount, swapType)
    paths.push(nextPath)
    if(swapType == "exactIn") {
      amountLeft = amountLeft.sub(nextPath.amountIn)
    } else {
      amountLeft = amountLeft.sub(nextPath.amountOut)
    }
    if(amountLeft.gt(0)) {
      nucleusState = adjustNucleusState(nucleusState, nextPath)
    }
  }
  */
  // fetch state
  var stateUrl = `https://stats.hydrogendefi.xyz/state/?chainID=${chainID}`
  var tokensUrl = `https://stats-cdn.hydrogendefi.xyz/${chainID}/tokens.json`
  var [nucleusState, tokens, block, ethPrice] = await Promise.all([
    //axios.get(stateUrl).then(res => res.data),
    fetchNucleusState(chainID),
    axios.get(tokensUrl).then(res => res.data),
    getProvider(chainID).then(provider => provider.getBlock("latest")),
    fetchCurrentEthPrice(),
  ])
  // search
  var paths = findPaths(params, nucleusState)
  // other return data
  var amountIn = Zero
  var amountOut = Zero
  var gasUsePerMarketOrder = BN.from(185_000)
  var numMarketOrders = 0
  for(var pathIndex = 0; pathIndex < paths.length; pathIndex++) {
    var path = paths[pathIndex]
    amountIn = amountIn.add(path.amountIn)
    amountOut = amountOut.add(path.amountOut)
    numMarketOrders += path.hops.length
  }
  var gasPriceWei = block.baseFeePerGas
  var gasUseEstimate = gasUsePerMarketOrder.mul(numMarketOrders)
  var gasUseEstimateQuote = BN.from(gasPriceWei).mul(gasUseEstimate).mul(ethPrice).div(oneToken(18))
  var tokensByAddress = getTokensByAddress(tokens)
  var tokenIn = tokensByAddress[tokenInAddress]
  var tokenOut = tokensByAddress[tokenOutAddress]
  var amountDecimals
  var quote
  var quoteDecimals
  if(swapType == "exactIn") {
    if(!!tokenIn) amountDecimals = formatUnits(amountIn, tokenIn.decimals)
    quote = amountOut.toString()
    if(!!tokenOut) quoteDecimals = formatUnits(amountOut, tokenOut.decimals)
  }
  if(swapType == "exactOut") {
    if(!!tokenOut) amountDecimals = formatUnits(amountOut, tokenOut.decimals)
    quote = amountIn.toString()
    if(!!tokenIn) quoteDecimals = formatUnits(amountIn, tokenIn.decimals)
  }
  return JSON.stringify({
    blockNumber: `${nucleusState.lastScannedBlock}`,
    swapType: swapType,
    amount: amount.toString(),
    amountDecimals: amountDecimals,
    quote: quote,
    quoteDecimals: quoteDecimals,

    protocol: "Hydrogen",
    paths: paths,

    gasPriceWei: gasPriceWei.toString(),
    gasUseEstimate: gasUseEstimate.toString(),
    gasUseEstimateQuote: gasUseEstimateQuote.toString(),
    gasUseEstimateQuoteDecimals: formatUnits(gasUseEstimateQuote, 18),
    gasUseEstimateUSD: formatUnits(gasUseEstimateQuote, 18),

    simulationStatus: "UNATTEMPTED",
    simulationError: false,

    //routeSummary: selectedPath.summarizePath(),
    //routeDetailed: selectedPath,
    //routeTxdatas: txdatas,
    //routeTxdescriptions: txdescriptions,
    //gasTokenInput: BN.from(gasTokenInput).toString(),
    //calldata: calldata
  })
}

// Lambda handler
exports.handler = async function(event) {
  try {
    const res = await route(event["queryStringParameters"])
    return {
      statusCode: 200,
      headers: headers,
      body: res
    }
  } catch (e) {
    if(e.name == "InputError") {
      return {
        statusCode: 400,
        headers: headers,
        body: e.stack
      }
    } else if(e.name == "PathNotFoundError") {
      return {
        statusCode: 404,
        headers: headers,
        body: e.stack
      }
    } else{
      //console.log("caught error")
      //console.log(e)
      await snsPublishError(event, e)
      return {
        statusCode: 500,
        headers: headers,
        body: "internal server error"
      }
    }
  }
}
