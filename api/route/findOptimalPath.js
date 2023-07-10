const ethers = require("ethers")
const BN = ethers.BigNumber
const { WeiPerEther, MaxUint256, AddressZero, Zero } = ethers.constants
const { getTradeRequestsByTokens } = require("./getTradeRequestsByTokens")
const { HydrogenNucleusHelper } = require("./../utils/HydrogenNucleusHelper")

function findOptimalPath(nucleusState, tokenInAddress, tokenOutAddress, maxAmount, swapType) {
  // setup
  // since trade requests are organized by [tokenA][tokenB], start search from tokenOut to tokenIn
  var tradeRequestsByTokens = getTradeRequestsByTokens(nucleusState)
  var searchQueue = [{tokenList: [tokenOutAddress], tokenSet: {[tokenOutAddress]:true}}]
  var searchResults = []
  // step 1: find acceptable token paths. don't worry about math yet
  while(searchQueue.length > 0) {
    //console.log(`search queue length: ${searchQueue.length}`)
    var searchItem = searchQueue.shift() // pop item off front
    var searchItemStr = JSON.stringify(searchItem)
    var tokenList = searchItem.tokenList
    var lastToken = tokenList[tokenList.length-1]
    var nextHops = tradeRequestsByTokens[lastToken]
    if(!nextHops) continue
    var nextTokens = Object.keys(nextHops)
    for(var tokenIndex = 0; tokenIndex < nextTokens.length; tokenIndex++) {
      var nextToken = nextTokens[tokenIndex]
      if(searchItem.tokenSet.hasOwnProperty(nextToken)) continue // no loops
      var nextSearchItem = JSON.parse(searchItemStr)
      nextSearchItem.tokenList.push(nextToken)
      nextSearchItem.tokenSet[nextToken] = true
      if(nextToken == tokenInAddress) {
        nextSearchItem.tokenList.reverse()
        searchResults.push(nextSearchItem.tokenList)
      }
      else {
        // cap max length to 4 tokens / 3 hops
        if(nextSearchItem.tokenList.length >= 4) continue
        searchQueue.push(nextSearchItem)
      }
    }
  }
  if(searchResults.length == 0) throw { name: "PathNotFoundError", stack: "No paths found. Verify the token addresses or create a limit order." }
  // step 2: math
  var bestPath = undefined
  for(var pathIndex = 0; pathIndex < searchResults.length; pathIndex++) {
    var tokenList = searchResults[pathIndex]
    //var tokenSymbols = tokenList.map(addr => tokensByAddress[addr].symbol)
    //console.log(`${pathIndex}: ${tokenSymbols.join(" -> ")}`)
    var hops = []
    for(var tokenIndex = 0; tokenIndex < tokenList.length-1; tokenIndex++) {
      var tokenA = tokenList[tokenIndex+1]
      var tokenB = tokenList[tokenIndex]
      hops.push(tradeRequestsByTokens[tokenA][tokenB][0])
    }
    var { hops, amountIn, amountOut } = calculateMultihopSwap(nucleusState, tokenList, hops, maxAmount, swapType)
    var thisPath = { amountIn, amountOut, tokenList, hops }
    if(pathIndex == 0) {
      bestPath = thisPath
      //console.log( parseFloat(formatUnits(thisPath.amountOut, 6)) / parseFloat(formatUnits(thisPath.amountIn, 18)) )
      //console.log("best path")
    } else {
      // compare by cross multiplication
      //console.log( parseFloat(formatUnits(bestPath.amountOut, 6)) / parseFloat(formatUnits(bestPath.amountIn, 18)) )
      //console.log( parseFloat(formatUnits(thisPath.amountOut, 6)) / parseFloat(formatUnits(thisPath.amountIn, 18)) )
      var cmL = thisPath.amountIn.mul(bestPath.amountOut)
      var cmR = bestPath.amountIn.mul(thisPath.amountOut)
      if(cmL.lt(cmR)) {
        //console.log("best path")
        bestPath = thisPath
      }
    }
  }
  return bestPath
}

function calculateMultihopSwap(nucleusState, tokenList, hops, maxAmount, swapType) {
  hops = JSON.parse(JSON.stringify(hops))
  // forward pass
  //var nextAmountBMT = hops[0].amountA
  //if(swapType == "exactIn") nextAmountBMT = bnMin(maxAmount, nextAmountBMT)
  var nextAmountBMT = (swapType == "exactIn") ? maxAmount : MaxUint256
  var backwardsPassFrom = 0
  for(var hopIndex = 0; hopIndex < hops.length; hopIndex++) {
    var hop = hops[hopIndex]
    hop.amountA = BN.from(hop.amountA)
    var amountBMT = nextAmountBMT
    var exchangeRate = hop.exchangeRate
    var tokenA = tokenList[hopIndex+1]
    var tokenB = tokenList[hopIndex]
    var feePPM = HydrogenNucleusHelper.getSwapFeeForPair(nucleusState, tokenA, tokenB).feePPM
    var { amountAMM, amountAMT, amountBMM } = HydrogenNucleusHelper.calculateMarketOrderExactBMT(amountBMT, exchangeRate, feePPM)
    //var tokenA2 = tokensByAddress[tokenA]
    //var tokenB2 = tokensByAddress[tokenB]
    //console.log(`market maker swaps ${formatUnits(amountBMT, tokenB2.decimals)} ${tokenB2.symbol} for ${formatUnits(amountAMT, tokenA2.decimals)} ${tokenA2.symbol}`)
    if(amountAMM.gt(hop.amountA)) {
      // insufficient capacity
      //console.log("insufficient capacity")
      backwardsPassFrom = hopIndex+1
      hop.amountAMT = hop.amountA
      nextAmountBMT = hop.amountA
    } else {
      hop.amountAMM = amountAMM
      hop.amountAMT = amountAMT
      hop.amountBMM = amountBMM
      hop.amountBMT = amountBMT
      nextAmountBMT = amountAMT
    }
  }
  if(swapType == "exactOut" && hops[hops.length-1].amountAMT.gt(maxAmount)) {
    backwardsPassFrom = hops.length
    hops[hops.length-1].amountAMT = maxAmount
  }
  // backward pass
  if(backwardsPassFrom > 0) {
    var nextAmountAMT = hops[backwardsPassFrom-1].amountAMT
    for(var hopIndex = backwardsPassFrom-1; hopIndex >= 0; hopIndex--) {
      var hop = hops[hopIndex]
      var amountAMT = nextAmountAMT
      var exchangeRate = hop.exchangeRate
      var tokenA = tokenList[hopIndex+1]
      var tokenB = tokenList[hopIndex]
      var feePPM = HydrogenNucleusHelper.getSwapFeeForPair(nucleusState, tokenA, tokenB).feePPM
      var { amountAMM, amountBMM, amountBMT } = HydrogenNucleusHelper.calculateMarketOrderExactAMT(amountAMT, exchangeRate, feePPM)
      hop.amountAMM = amountAMM
      hop.amountAMT = amountAMT
      hop.amountBMM = amountBMM
      hop.amountBMT = amountBMT
      nextAmountAMT = amountBMT
    }
  }
  var amountIn = hops[0].amountBMT
  var amountOut = hops[hops.length-1].amountAMT
  return { hops, amountIn, amountOut }
}
/*
function bnMin(x, y) {
  //var x2 = BN.from(x)
  //var y2 = BN.from(y)
  //if(x2.lt(y2)) return x2
  //return y2
  if(x.lt(y)) return x
  return y
}

function bnMax(x, y) {
  //var x2 = BN.from(x)
  //var y2 = BN.from(y)
  //if(x2.gt(y2)) return x2
  //return y2
  if(x.gt(y)) return x
  return y
}
*/
// there are N hops connecting N+1 tokens
// hop i connects token i and i+1
// tokenA = token[i+1], tokenB = token[i]
exports.findOptimalPath = findOptimalPath
