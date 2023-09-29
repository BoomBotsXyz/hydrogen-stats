const ethers = require("ethers")
const BN = ethers.BigNumber
const { WeiPerEther, MaxUint256, AddressZero, Zero } = ethers.constants
const { formatUnits } = ethers.utils
const multicall = require("ethers-multicall-hysland-finance")
const fs = require("fs")
const axios = require("axios")
const { withBackoffRetries } = require("./../utils/misc")
const { s3GetObjectPromise, s3PutObjectPromise, snsPublishError } = require("./../utils/aws")
const { getProvider, getMulticallProvider, multicallChunkedDict, axiosGet } = require("./../utils/network")
const { verifyParams } = require("./inputValidation")
const { fetchNucleusState } = require("./../tracker/fetchNucleusState")
//const { getTradeRequestsByTokens } = require("./getTradeRequestsByTokens")
//const { adjustNucleusState } = require("./adjustNucleusState")
const { findPaths } = require("./findPaths")
const { optimizePaths } = require("./optimizePaths")
const { encodeMarketOrderTransaction } = require("./encodeMarketOrderTransaction")
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

const statsCacheBucket = 'stats-cdn.hydrogendefi.xyz'

async function route(params) {
  params = verifyParams(params)

  var { chainID, tokenInAddress, tokenOutAddress, amount, swapType } = params

  // fetch state
  var [nucleusState, tokens, block, ethPrice] = await Promise.all([
    fetchNucleusState(chainID),
    s3GetObjectPromise({Bucket: statsCacheBucket, Key: `${chainID}/v1.0.0/tokens.json`}).then(res => JSON.parse(res)),
    getProvider(chainID).then(provider => provider.getBlock("latest")),
    fetchCurrentEthPrice(),
  ])
  // search
  var paths = findPaths(params, nucleusState)
  var hops = optimizePaths(paths)
  // other return data
  var amountIn = Zero
  var amountOut = Zero
  var gasUsePerMarketOrder = BN.from(185_000)
  var numMarketOrders = hops.length
  for(var pathIndex = 0; pathIndex < paths.length; pathIndex++) {
    var path = paths[pathIndex]
    amountIn = amountIn.add(path.amountIn)
    amountOut = amountOut.add(path.amountOut)
  }
  params.amountIn = amountIn
  params.amountOut = amountOut
  var txdata = encodeMarketOrderTransaction(params, hops)
  var gasPriceWei = block.baseFeePerGas
  var gasUseEstimate = gasUsePerMarketOrder.mul(numMarketOrders)
  var gasUseEstimateQuote = BN.from(gasPriceWei).mul(gasUseEstimate).mul(ethPrice).div(WeiPerEther)
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
    hops: hops,
    txdata: txdata,

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
