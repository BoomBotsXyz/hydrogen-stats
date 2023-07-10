const axios = require("axios")
const { adjustNucleusState } = require("./adjustNucleusState")
const { findOptimalPath } = require("./findOptimalPath")

function findPaths(params, nucleusState) {
  // step 1: setup
  var { chainID, tokenInAddress, tokenOutAddress, amount, swapType } = params
  nucleusState = JSON.parse(JSON.stringify(nucleusState))
  // vars
  var paths = []
  var amountLeft = amount
  // step 2: search
  while(amountLeft.gt(0)) {
    var maxAmount = amountLeft
    var nextPath = findOptimalPath(nucleusState, tokenInAddress, tokenOutAddress, maxAmount, swapType)
    if(swapType == "exactIn") {
      amountLeft = amountLeft.sub(nextPath.amountIn)
    } else {
      amountLeft = amountLeft.sub(nextPath.amountOut)
    }
    if(amountLeft.gt(0)) {
      nucleusState = adjustNucleusState(nucleusState, nextPath)
    }
    // remove unnecessary info from path before pushing
    for(var hopIndex = 0; hopIndex < nextPath.hops.length; hopIndex++) {
      nextPath.hops[hopIndex].amountA = undefined
      nextPath.hops[hopIndex].locationB = undefined
    }
    paths.push(nextPath)
  }
  return paths
}
exports.findPaths = findPaths
