const ethers = require("ethers")
const BN = ethers.BigNumber
const { AddressZero } = ethers.constants
const { getAddress } = ethers.utils
const multicall = require("ethers-multicall-hysland-finance")
const { range, sortBNs, readJsonFile, deduplicateArray } = require("./../utils/misc")
const { s3GetObjectPromise, s3PutObjectPromise, snsPublishError } = require("./../utils/aws")
const { getProvider, getMulticallProvider, multicallChunked, fetchEvents, findDeployBlock } = require("./../utils/network")
const { getNetworkSettings } = require("./../utils/getNetworkSettings")
const { createPoolMetadata } = require("./../pools/metadata/createPoolMetadata")

const ABI_NUCLEUS = readJsonFile("./data/abi/Hydrogen/HydrogenNucleus.json")
const ABI_ERC20 = readJsonFile("./data/abi/other/ERC20.json")

async function fetchNucleusState(chainID) {
  // setup
  let state = JSON.parse(await s3GetObjectPromise({ Bucket: 'stats.hydrogen.hysland.finance.data', Key: `${chainID}/state.json` }))
  let mcProvider = await getMulticallProvider(chainID)
  let provider = mcProvider._provider
  let networkSettings = getNetworkSettings(chainID);
  let latestBlock = (await provider.getBlockNumber()) - networkSettings.confirmations
  let errors = []
  let nucleus = new ethers.Contract(state.nucleusAddress, ABI_NUCLEUS, provider)
  let nucleusMC = new multicall.Contract(state.nucleusAddress, ABI_NUCLEUS)
  // find deploy block
  if(state.deployBlock === -1) {
    state.deployBlock = await findDeployBlock(provider, nucleus.address)
    state.lastScannedBlock = state.deployBlock - 1
  }
  // scan for new events
  if(latestBlock > state.lastScannedBlock) {
    let eventFilter = { address: nucleus.address, topics: [] }
    let newEvents = await fetchEvents(nucleus, eventFilter, state.lastScannedBlock+1, latestBlock)
    // if new events to process
    if(newEvents.length > 0) {
      let events = JSON.parse(await s3GetObjectPromise({ Bucket: 'stats.hydrogen.hysland.finance.data', Key: `${chainID}/events.json` }))
      let newBlockNumbers = deduplicateArray(newEvents.map(event => event.blockNumber))
      let timestamps = await Promise.all(newBlockNumbers.map(num => provider.getBlock(num).then((block) => block.timestamp)))
      for(let i = 0; i < newBlockNumbers.length; ++i) {
        events.blockTimestamps[newBlockNumbers[i]] = timestamps[i]
      }
      events.events.push(...newEvents)
      let newPoolIDs = []
      // process events
      for(let i = 0; i < newEvents.length; i++) {
        let event = newEvents[i]
        if(event.event === "OwnershipTransferred") {
          state.contractOwner = event.args.newOwner
        } else if(event.event === "BaseURISet") {
          state.baseURI = event.args.baseURI
        } else if(event.event === "SwapFeeSetForPair") {
          let { tokenA, tokenB, feePPM, receiverLocation } = event.args
          if(!state.swapFees.hasOwnProperty(tokenA)) state.swapFees[tokenA] = {}
          state.swapFees[tokenA][tokenB] = { feePPM: feePPM.toString(), receiverLocation }
        } else if(event.event === "FlashLoanFeeSetForToken") {
          let { token, feePPM, receiverLocation } = event.args
          state.flashLoanFees[token] = { feePPM: feePPM.toString(), receiverLocation }
        } else if(event.event === "TokensTransferred") {
          let { token, amount, from, to } = event.args
          let amountBN = BN.from(amount)
          function modifyBalance(token, location, amount) {
            let locationType = parseInt(location.substring(0,4))
            if(locationType === 1) {
              // don't track external balances
            } else if(locationType === 2) {
              if(location.substring(4, 26) != "0000000000000000000000") {
                errors.push(`Error processing transaction=${event.transactionHash} logIndex=${event.logIndex} TokensTransferred(token=${token}, amount=${amount}, from=${from}, to=${to}). Invalid location '${location}'`)
                return
              }
              let address = getAddress(`0x${location.substring(26,66)}`)
              if(!state.internalBalancesByAccount.hasOwnProperty(address)) state.internalBalancesByAccount[address] = {}
              if(!state.internalBalancesByAccount[address].hasOwnProperty(token)) state.internalBalancesByAccount[address][token] = "0"
              state.internalBalancesByAccount[address][token] = BN.from(state.internalBalancesByAccount[address][token]).add(amount).toString()
            } else if(locationType === 3) {
              let poolID = BN.from(`0x${location.substring(4,66)}`).toString()
              if(!state.internalBalancesByPool.hasOwnProperty(poolID)) state.internalBalancesByPool[poolID] = {}
              if(!state.internalBalancesByPool[poolID].hasOwnProperty(token)) state.internalBalancesByPool[poolID][token] = "0"
              state.internalBalancesByPool[poolID][token] = BN.from(state.internalBalancesByPool[poolID][token]).add(amount).toString()
            } else {
              errors.push(`Error processing transaction=${event.transactionHash} logIndex=${event.logIndex} TokensTransferred(token=${token}, amount=${amount}, from=${from}, to=${to}). Invalid location type '${locationType}'`)
            }
          }
          modifyBalance(token, from, amountBN.mul(-1))
          modifyBalance(token, to, amountBN)
        } else if(event.event === "PoolCreated") {
          newPoolIDs.push(event.args.poolID.toString())
          state.pools[event.args.poolID.toString()] = {
            owner: AddressZero,
            tradeRequests: {}
          }
        } else if(event.event === "Transfer") {
          state.pools[event.args.tokenId.toString()].owner = event.args.to
        } else if(event.event === "TradeRequestUpdated") {
          let { poolID, tokenA, tokenB, exchangeRate, locationB } = event.args
          poolID = poolID.toString()
          if(!state.pools[poolID].tradeRequests.hasOwnProperty(tokenA)) state.pools[poolID].tradeRequests[tokenA] = {}
          state.pools[poolID].tradeRequests[tokenA][tokenB] = { exchangeRate, locationB }
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
      let promises = newPoolIDs.map(poolID => createPoolMetadata(chainID, poolID))
      promises.push(s3PutObjectPromise({ Bucket: 'stats.hydrogen.hysland.finance.data', Key: `${chainID}/state.json`, Body: JSON.stringify(state), ContentType: "application/json" }))
      promises.push(s3PutObjectPromise({ Bucket: 'stats.hydrogen.hysland.finance.data', Key: `${chainID}/events.json`, Body: JSON.stringify(events), ContentType: "application/json" }))
      await Promise.all(promises)
    }
    // if there were no events to process
    else {
      // debounce unnecessary writes
      let numBlocksScanned = latestBlock - state.lastScannedBlock
      if(numBlocksScanned >= networkSettings.minScanWriteBlocks) {
        // write to s3
        state.lastScannedBlock = latestBlock
        await s3PutObjectPromise({ Bucket: 'stats.hydrogen.hysland.finance.data', Key: `${chainID}/state.json`, Body: JSON.stringify(state), ContentType: "application/json" })
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
