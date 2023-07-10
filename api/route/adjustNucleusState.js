const ethers = require("ethers")
const BN = ethers.BigNumber
const { WeiPerEther, MaxUint256, AddressZero } = ethers.constants
const { formatUnits, getAddress } = ethers.utils
const { HydrogenNucleusHelper } = require("./../utils/HydrogenNucleusHelper")

function adjustNucleusState(nucleusState, path) {
  nucleusState = JSON.parse(JSON.stringify(nucleusState))
  // helper functions
  function modifyBalance(token, location, amount) {
    try {
      location = location.toHexString()
    } catch(e) {}
    //console.log("modifying", location)
    var locationType = parseInt(location.substring(0,4))
    if(locationType === 1) {
      // don't track external balances
    } else if(locationType === 2) {
      if(location.substring(4, 26) != "0000000000000000000000") {
        throw new Error(`Invalid location '${location}'`)
      }
      var address = getAddress(`0x${location.substring(26,66)}`)
      checkNonNullTokenBalanceAtAccount(token, address)
      nucleusState.internalBalancesByAccount[address][token] = BN.from(nucleusState.internalBalancesByAccount[address][token]).add(amount).toString()
      nucleusState.internalBalancesSum[token] = BN.from(nucleusState.internalBalancesSum[token]).add(amount).toString()
    } else if(locationType === 3) {
      var poolID = BN.from(`0x${location.substring(4,66)}`).toString()
      checkNonNullTokenBalanceAtPool(token, poolID)
      nucleusState.internalBalancesByPool[poolID][token] = BN.from(nucleusState.internalBalancesByPool[poolID][token]).add(amount).toString()
      nucleusState.internalBalancesSum[token] = BN.from(nucleusState.internalBalancesSum[token]).add(amount).toString()
    } else {
      throw new Error(`Invalid location '${location}'`)
    }
  }
  function checkNonNullTokenBalanceAtSum(token) {
    if(!nucleusState.internalBalancesSum.hasOwnProperty(token)) nucleusState.internalBalancesSum[token] = "0"
  }
  function checkNonNullTokenBalanceAtAccount(token, account) {
    if(!nucleusState.internalBalancesByAccount.hasOwnProperty(account)) nucleusState.internalBalancesByAccount[account] = {}
    if(!nucleusState.internalBalancesByAccount[account].hasOwnProperty(token)) nucleusState.internalBalancesByAccount[account][token] = "0"
    checkNonNullTokenBalanceAtSum(token)
  }
  function checkNonNullTokenBalanceAtPool(token, poolID) {
    if(!nucleusState.internalBalancesByPool.hasOwnProperty(poolID)) nucleusState.internalBalancesByPool[poolID] = {}
    if(!nucleusState.internalBalancesByPool[poolID].hasOwnProperty(token)) nucleusState.internalBalancesByPool[poolID][token] = "0"
    checkNonNullTokenBalanceAtSum(token)
  }
  // adjust for each hop
  for(var hopIndex = 0; hopIndex < path.hops.length; hopIndex++) {
    var hop = path.hops[hopIndex]
    var tokenA = path.tokenList[hopIndex+1]
    var tokenB = path.tokenList[hopIndex]
    //nucleusState.internalBalancesByPool[hop.poolID][tokenA] = BN.from(nucleusState.internalBalancesByPool[hop.poolID][tokenA]).sub(hop.amountAMM).toString()
    var poolLocationB = nucleusState.pools[hop.poolID].tradeRequests[tokenA][tokenB].locationB
    modifyBalance(tokenA, HydrogenNucleusHelper.poolIDtoLocation(hop.poolID), hop.amountAMM.mul(-1))
    modifyBalance(tokenB, poolLocationB, hop.amountBMM)
    var amountBFR = hop.amountBMT.sub(hop.amountBMM)
    if(amountBFR.gt(0)) {
      var feeReceiver = HydrogenNucleusHelper.getSwapFeeForPair(nucleusState, tokenA, tokenB).receiverLocation
      modifyBalance(tokenB, feeReceiver, amountBFR)
    }
  }
  return nucleusState
}
exports.adjustNucleusState = adjustNucleusState
