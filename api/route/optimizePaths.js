const ethers = require("ethers")
const BN = ethers.BigNumber

function groupPathsToHops(paths) {
  // group by same poolID-tokenA-tokenB combo
  var hopsDict = {}
  // loop over all paths
  for(const path of paths) {
    // loop over all hops in path
    for(var i = 0; i < path.hops.length; i++) {
      var tokenA = path.tokenList[i+1]
      var tokenB = path.tokenList[i]
      var poolID = path.hops[i].poolID
      var descriptor = `${poolID}-${tokenA}-${tokenB}`
      // is known. aggregate
      if(hopsDict.hasOwnProperty(descriptor)) {
        hopsDict[descriptor].amountAMT = hopsDict[descriptor].amountAMT.add(path.hops[i].amountAMT)
        hopsDict[descriptor].amountBMT = hopsDict[descriptor].amountBMT.add(path.hops[i].amountBMT)
      }
      // unknown. add new
      else {
        hopsDict[descriptor] = {
          descriptor: descriptor,
          poolID: path.hops[i].poolID,
          tokenB: tokenB,
          tokenA: tokenA,
          amountAMT: BN.from(path.hops[i].amountAMT),
          amountBMT: BN.from(path.hops[i].amountBMT),
        }
      }
    }
  }
  return hopsDict
}

function orderHops(hopsDict) {
  // 0. init tokenset
  var tokenset = {}
  for(const hop of Object.values(hopsDict)) {
    tokenset[hop.tokenA] = {
      token: hop.tokenA,
      prereqs: []
    }
    tokenset[hop.tokenB] = {
      token: hop.tokenB,
      prereqs: []
    }
  }
  // 1. add prereqs to tokenset
  for(const hop of Object.values(hopsDict)) {
    tokenset[hop.tokenA].prereqs.push(hop.descriptor)
  }
  // 2. process tokenset
  var hopsArr = []
  // while not all hops processed
  while(hopsArr.length < Object.keys(hopsDict).length) {
    // loop over tokens
    for(const token of Object.keys(tokenset)) {
      var tokenData = tokenset[token]
      if(!tokenData) continue
      // determine if prereqs are satisfied
      var prereqsSatisfied = true
      for(const descriptor of tokenData.prereqs) {
        if(!hopsDict[descriptor].isFilled) prereqsSatisfied = false
      }
      if(!prereqsSatisfied) continue
      // process all hops whose tokenB=token
      var filteredHops = (Object.values(hopsDict)
        .filter(hop => hop.tokenB == token)
        .sort((hopX,hopY) => (hopX.tokenA == hopY.tokenA ? 0 : hopX.tokenA < hopY.tokenA ? 1 : -1) )
      )
      for(const hop of filteredHops) {
        hop.isFilled = true
        hopsArr.push(hop)
      }
      // remove token from set
      tokenset[token] = undefined
    }
  }
  // format and return
  return hopsArr.map(hop => {
    return {
      poolID: hop.poolID,
      tokenB: hop.tokenB,
      tokenA: hop.tokenA,
      amountAMT: hop.amountAMT.toString(),
      amountBMT: hop.amountBMT.toString(),
    }
  })
}

function optimizePaths(paths) {
  var hopsDict = groupPathsToHops(paths)
  var hopsArr = orderHops(hopsDict)
  return hopsArr
}
exports.optimizePaths = optimizePaths
