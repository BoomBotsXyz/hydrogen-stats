const ethers = require("ethers")
const BN = ethers.BigNumber
const { HydrogenNucleusHelper } = require("./../utils/HydrogenNucleusHelper")

function getTradeRequestsByTokens(nucleusState) {
  var pools = nucleusState.pools
  var poolIDs = Object.keys(pools)
  var poolBalances = nucleusState.internalBalancesByPool
  // separate trade requests by tokenA->tokenB. filter zeros and invalids
  var tradeRequestsByTokens = {}
  var tokenSet = {}
  for(var i = 0; i < poolIDs.length; i++) {
    var poolID = poolIDs[i]
    var pool = pools[poolID]
    var tokenAs = Object.keys(pool.tradeRequests)
    for(var j = 0; j < tokenAs.length; j++) {
      var tokenA = tokenAs[j]
      var balanceA = BN.from(poolBalances[poolID][tokenA] || "0")
      if(balanceA.lte(0)) continue
      if(!tradeRequestsByTokens.hasOwnProperty(tokenA)) tradeRequestsByTokens[tokenA] = {}
      tokenSet[tokenA] = true
      var tokenBs = Object.keys(pool.tradeRequests[tokenA])
      for(var k = 0; k < tokenBs.length; k++) {
        var tokenB = tokenBs[k]
        var tradeRequest = pool.tradeRequests[tokenA][tokenB]
        if(!HydrogenNucleusHelper.exchangeRateIsNonzero(tradeRequest.exchangeRate)) continue
        if(!tradeRequestsByTokens[tokenA].hasOwnProperty(tokenB)) tradeRequestsByTokens[tokenA][tokenB] = []
        tokenSet[tokenB] = true
        tradeRequestsByTokens[tokenA][tokenB].push({
          poolID,
          ...tradeRequest,
          amountA: balanceA
        })
      }
    }
  }
  // sort trade requests by exchange rate - most A per B first
  var tokens = Object.keys(tokenSet)
  for(var j = 0; j < tokens.length; j++) {
    var tokenA = tokens[j]
    for(var k = 0; k < tokens.length; k++) {
      if(j == k) continue
      var tokenB = tokens[k]
      if(!tradeRequestsByTokens.hasOwnProperty(tokenA) || !tradeRequestsByTokens[tokenA].hasOwnProperty(tokenB)) continue
      var tradeRequests = tradeRequestsByTokens[tokenA][tokenB]
      tradeRequests.sort((reqX, reqY) => {
        var erX = HydrogenNucleusHelper.decodeExchangeRate(reqX.exchangeRate)
        var erY = HydrogenNucleusHelper.decodeExchangeRate(reqY.exchangeRate)
        var cmL = erX[0].mul(erY[1])
        var cmR = erY[0].mul(erX[1])
        if(cmL.gt(cmR)) return -1
        if(cmL.lt(cmR)) return 1
        return 0
      })
    }
  }
  return tradeRequestsByTokens
}
exports.getTradeRequestsByTokens = getTradeRequestsByTokens
