const ethers = require("ethers")
const BN = ethers.BigNumber
const { AddressZero } = ethers.constants
const { getAddress } = ethers.utils
const multicall = require("ethers-multicall-hysland-finance")
const { range, sortBNs, readJsonFile, deduplicateArray } = require("./../utils/misc")
const { s3GetObjectPromise, s3PutObjectPromise, snsPublishError } = require("./../utils/aws")
const { getProvider, getMulticallProvider, multicallChunked, fetchEvents, findDeployBlock } = require("./../utils/network")
const { getNetworkSettings } = require("./../utils/getNetworkSettings")
const { storePool } = require("./../pools/storePool")

const ABI_NUCLEUS = readJsonFile("./data/abi/Hydrogen/HydrogenNucleus.json")
const ABI_ERC20 = readJsonFile("./data/abi/other/ERC20.json")

async function fetchNucleusState(chainID) {
  // setup
  var s3KeyState = `${chainID}/state.json`;
  var s3KeyEvents = `${chainID}/events.json`;
  var state = JSON.parse(await s3GetObjectPromise({ Bucket: 'stats.hydrogen.hysland.finance.data', Key: s3KeyState }))
  var mcProvider = await getMulticallProvider(chainID)
  var provider = mcProvider._provider
  var networkSettings = getNetworkSettings(chainID);
  var latestBlock = (await provider.getBlockNumber()) - networkSettings.confirmations
  var errors = []
  var nucleus = new ethers.Contract(state.nucleusAddress, ABI_NUCLEUS, provider)
  var nucleusMC = new multicall.Contract(state.nucleusAddress, ABI_NUCLEUS)
  // find deploy block
  if(state.deployBlock === -1) {
    state.deployBlock = await findDeployBlock(provider, nucleus.address)
    state.lastScannedBlock = state.deployBlock - 1
  }
  // scan for new events
  if(latestBlock > state.lastScannedBlock) {
    var eventFilter = { address: nucleus.address, topics: [] }
    var newEvents = await fetchEvents(nucleus, eventFilter, state.lastScannedBlock+1, latestBlock)
    // if new events to process
    if(newEvents.length > 0) {
      var events = JSON.parse(await s3GetObjectPromise({ Bucket: 'stats.hydrogen.hysland.finance.data', Key: s3KeyEvents }))
      var newBlockNumbers = deduplicateArray(newEvents.map(event => event.blockNumber))
      var timestamps = await Promise.all(newBlockNumbers.map(num => provider.getBlock(num).then((block) => block.timestamp)))
      for(var i = 0; i < newBlockNumbers.length; ++i) {
        events.blockTimestamps[newBlockNumbers[i]] = timestamps[i]
      }
      events.events.push(...newEvents)
      var newPoolIDs = []
      // helper functions
      function modifyBalance(token, location, amount) {
        var locationType = parseInt(location.substring(0,4))
        if(locationType === 1) {
          // don't track external balances
        } else if(locationType === 2) {
          if(location.substring(4, 26) != "0000000000000000000000") {
            errors.push(`Error processing transaction=${event.transactionHash} logIndex=${event.logIndex} TokensTransferred(token=${token}, amount=${amount}, from=${from}, to=${to}). Invalid location '${location}'`)
            return
          }
          var address = getAddress(`0x${location.substring(26,66)}`)
          checkNonNullTokenBalanceAtAccount(token, address)
          state.internalBalancesByAccount[address][token] = BN.from(state.internalBalancesByAccount[address][token]).add(amount).toString()
          state.internalBalancesSum[token] = BN.from(state.internalBalancesSum[token]).add(amount).toString()
        } else if(locationType === 3) {
          var poolID = BN.from(`0x${location.substring(4,66)}`).toString()
          checkNonNullTokenBalanceAtPool(token, poolID)
          state.internalBalancesByPool[poolID][token] = BN.from(state.internalBalancesByPool[poolID][token]).add(amount).toString()
          state.internalBalancesSum[token] = BN.from(state.internalBalancesSum[token]).add(amount).toString()
        } else {
          errors.push(`Error processing transaction=${event.transactionHash} logIndex=${event.logIndex} TokensTransferred(token=${token}, amount=${amount}, from=${from}, to=${to}). Invalid location type '${locationType}'`)
        }
      }
      function checkNonNullTokenBalanceAtSum(token) {
        if(!state.internalBalancesSum.hasOwnProperty(token)) state.internalBalancesSum[token] = "0"
      }
      function checkNonNullTokenBalanceAtAccount(token, account) {
        if(!state.internalBalancesByAccount.hasOwnProperty(account)) state.internalBalancesByAccount[account] = {}
        if(!state.internalBalancesByAccount[account].hasOwnProperty(token)) state.internalBalancesByAccount[account][token] = "0"
        checkNonNullTokenBalanceAtSum(token)
      }
      function checkNonNullTokenBalanceAtPool(token, poolID) {
        if(!state.internalBalancesByPool.hasOwnProperty(poolID)) state.internalBalancesByPool[poolID] = {}
        if(!state.internalBalancesByPool[poolID].hasOwnProperty(token)) state.internalBalancesByPool[poolID][token] = "0"
        checkNonNullTokenBalanceAtSum(token)
      }
      // process events
      for(var i = 0; i < newEvents.length; i++) {
        var event = newEvents[i]
        if(event.event === "OwnershipTransferStarted") {
          state.contractOwnerPending = event.args.newOwner
        } else if(event.event === "OwnershipTransferred") {
          state.contractOwner = event.args.newOwner
        } else if(event.event === "BaseURISet") {
          state.baseURI = event.args.baseURI
        } else if(event.event === "ContractURISet") {
          state.contractURI = event.args.contractURI
        } else if(event.event === "SwapFeeSetForPair") {
          var { tokenA, tokenB, feePPM, receiverLocation } = event.args
          if(!state.swapFees.hasOwnProperty(tokenA)) state.swapFees[tokenA] = {}
          state.swapFees[tokenA][tokenB] = { feePPM: feePPM.toString(), receiverLocation }
        } else if(event.event === "FlashLoanFeeSetForToken") {
          var { token, feePPM, receiverLocation } = event.args
          state.flashLoanFees[token] = { feePPM: feePPM.toString(), receiverLocation }
        } else if(event.event === "TokensTransferred") {
          var { token, amount, from, to } = event.args
          var amountBN = BN.from(amount)
          modifyBalance(token, from, amountBN.mul(-1))
          modifyBalance(token, to, amountBN)
        } else if(event.event === "PoolCreated") {
          var poolID = event.args.poolID.toString()
          newPoolIDs.push(poolID)
          state.pools[poolID] = {
            poolID: poolID,
            owner: AddressZero,
            tradeRequests: {}
          }
          if(!state.internalBalancesByPool.hasOwnProperty(poolID)) state.internalBalancesByPool[poolID] = {}
        } else if(event.event === "Transfer") {
          state.pools[event.args.tokenId.toString()].owner = event.args.to
        } else if(event.event === "TradeRequestUpdated") {
          var { poolID, tokenA, tokenB, exchangeRate, locationB } = event.args
          poolID = poolID.toString()
          if(!state.pools[poolID].tradeRequests.hasOwnProperty(tokenA)) state.pools[poolID].tradeRequests[tokenA] = {}
          state.pools[poolID].tradeRequests[tokenA][tokenB] = { exchangeRate, locationB }
          checkNonNullTokenBalanceAtPool(tokenA, poolID);
          checkNonNullTokenBalanceAtPool(tokenB, poolID);
        } else if(event.event === "Approval") {
          // don't track approvals
        } else if(event.event === "ApprovalForAll") {
          // don't track approvals
        } else if(event.event === "MarketOrderExecuted") {
          // key values are tracked in related TokensTransferred events. nothing to do here
        } else {
          errors.push(`Error processing transaction=${event.transactionHash} logIndex=${event.logIndex}. Unknown event ${event.event}`)
        }
      }
      // write to s3
      state.lastScannedBlock = latestBlock
      var promises = newPoolIDs.map(poolID => storePool(chainID, state.nucleusAddress, poolID))
      promises.push(s3PutObjectPromise({ Bucket: 'stats.hydrogen.hysland.finance.data', Key: s3KeyState, Body: JSON.stringify(state), ContentType: "application/json" }))
      promises.push(s3PutObjectPromise({ Bucket: 'stats.hydrogen.hysland.finance.data', Key: s3KeyEvents, Body: JSON.stringify(events), ContentType: "application/json" }))
      await Promise.all(promises)
    }
    // if there were no events to process
    else {
      // debounce unnecessary writes
      var numBlocksScanned = latestBlock - state.lastScannedBlock
      if(numBlocksScanned >= networkSettings.minScanWriteBlocks) {
        // write to s3
        state.lastScannedBlock = latestBlock
        await s3PutObjectPromise({ Bucket: 'stats.hydrogen.hysland.finance.data', Key: s3KeyState, Body: JSON.stringify(state), ContentType: "application/json" })
      }
    }
  }
  // log errors
  if(errors.length > 0) {
    await snsPublishError(undefined, `Errors in fetchNucleusState:\n${errors.join('\n')}`)
  }
  return state
}
exports.fetchNucleusState = fetchNucleusState
