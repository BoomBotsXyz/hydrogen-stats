const ethers = require("ethers")
const BN = ethers.BigNumber
const { WeiPerEther } = ethers.constants
const formatUnits = ethers.utils.formatUnits
const fs = require("fs")

const { withBackoffRetries } = require("./misc")
const { getProvider } = require("./network")

const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
const x192 = BN.from("0x01000000000000000000000000000000000000000000000000")

// returns the balance of a holder for a list of tokens
// result is an array
// each element will be a decimal formatted string eg [ "1.2" ]
async function fetchBalances(provider, tokenList, holder, blockTag="latest") {
  function createBalancePromise(i) {
    return new Promise((resolve, reject) => {
      withBackoffRetries(() => ((tokenList[i].address == ETH_ADDRESS)
        ? provider.getBalance(holder, blockTag=blockTag)
        : tokenList[i].contract.balanceOf(holder, {blockTag:blockTag})
      )).then(bal => { resolve(formatUnits(bal, tokenList[i].decimals)) }).catch(() => { resolve("0.0") })
    })
  }
  var promises = []
  for(var i = 0; i < tokenList.length; ++i) {
    promises.push(createBalancePromise(i))
  }
  return Promise.all(promises)
}
exports.fetchBalances = fetchBalances

// returns the balance of a holder for a list of ctokens
// result is an array
// each element will be an object eg [ {ctokenBalance: "1.2", utokenBalance: "2.5", exchangeRate: "2."}]
async function fetchCTokenBalances(ctokenList, holder, blockTag="latest") {
  function createBalancePromise(i) {
    return new Promise(async (resolve, reject) => {
      try {
        var [cbal, rate] = await Promise.all([
          withBackoffRetries(() => ctokenList[i].contract.balanceOf(holder, {blockTag:blockTag})),
          withBackoffRetries(() => ctokenList[i].contract.callStatic.exchangeRateCurrent({blockTag:blockTag}))
        ])
        // TODO: check math. works for cAURORA
        var ubal = cbal.mul(rate).div(WeiPerEther)
        var ctokenBalance = formatUnits(cbal, ctokenList[i].cdecimals)
        var utokenBalance = formatUnits(ubal, ctokenList[i].udecimals)
        var exchangeRate = formatUnits(rate, 28)
        resolve({ctokenBalance, utokenBalance, exchangeRate})
      } catch(e) {
        resolve({ctokenBalance:"0.0", utokenBalance:"0.0", exchangeRate:"0.0"})
      }
    })
  }
  var promises = []
  for(var i = 0; i < ctokenList.length; ++i) {
    promises.push(createBalancePromise(i))
  }
  return Promise.all(promises)
}
exports.fetchCTokenBalances = fetchCTokenBalances

// fetch the total supply of a token
// if the token does not exist returns 0
async function fetchSupplyOrZero(token, blockTag="latest") {
  return new Promise((resolve, reject) => {
    withBackoffRetries(() => token.totalSupply({blockTag:blockTag})).then(resolve).catch(()=>{resolve(BN.from(0))})
  })
}
exports.fetchSupplyOrZero = fetchSupplyOrZero

// fetch the token balance of a holder
// if the token does not exist returns 0
async function fetchBalanceOrZero(token, holder, blockTag="latest") {
  return new Promise((resolve, reject) => {
    withBackoffRetries(() => token.balanceOf(holder, {blockTag:blockTag})).then(resolve).catch(()=>{resolve(BN.from(0))})
  })
}
exports.fetchBalanceOrZero = fetchBalanceOrZero

// fetch the reserves of a uniswap v2 pair (and forks)
// if the pool does not exist returns 0
async function fetchReservesOrZero(pair, blockTag="latest") {
  return new Promise((resolve, reject) => {
    withBackoffRetries(() => pair.getReserves({blockTag:blockTag})).then(resolve).catch(()=>{resolve({_reserve0:BN.from(0),_reserve1:BN.from(0)})})
  })
}
exports.fetchReservesOrZero = fetchReservesOrZero

// fetch the price of a token in a uniswap v2 pool
async function fetchUniswapV2PriceOrZero(pair, oneZero, decimals0, decimals1, blockTag="latest") {
  return new Promise((resolve, reject) => {
    withBackoffRetries(() => pair.getReserves({blockTag:blockTag})).then(reserves => {
      resolve(calculateUniswapV2PriceOrZero(reserves._reserve0, reserves._reserve1, oneZero, decimals0, decimals1))
    }).catch(()=>{resolve(0.0)})
  })
}
exports.fetchUniswapV2PriceOrZero = fetchUniswapV2PriceOrZero

// given uniswap v2 pool reserves, calculates the price of a token
function calculateUniswapV2PriceOrZero(reserve0, reserve1, oneZero, decimals0, decimals1) {
  if(reserve0.eq(0) || reserve1.eq(0)) return 0.0
  else {
    var amt0 = parseFloat(formatUnits(reserve0, decimals0))
    var amt1 = parseFloat(formatUnits(reserve1, decimals1))
    // oneZero == true -> price of token 1 in terms of token 0
    var price = oneZero ? amt0/amt1 : amt1/amt0
    return price
  }
}
exports.calculateUniswapV2PriceOrZero = calculateUniswapV2PriceOrZero

// fetch the price of a token in a uniswap v3 pool
async function fetchUniswapV3PriceOrZero(pool, oneZero, decimals0, decimals1, blockTag="latest") {
  return new Promise((resolve, reject) => {
    withBackoffRetries(() => pool.slot0({blockTag:blockTag})).then(slot0 => {
      var price = parseFloat(formatUnits(
        slot0.sqrtPriceX96.mul(slot0.sqrtPriceX96)
        .mul(WeiPerEther)
        .mul(oneToken(decimals0))
        .div(oneToken(decimals1))
        .div(x192),
      18))
      // oneZero == true -> price of token 1 in terms of token 0
      if(price != 0.0 && !oneZero) price = 1/price
      resolve(price)
    }).catch(()=>{resolve(0.0)})
  })
}
exports.fetchUniswapV3PriceOrZero = fetchUniswapV3PriceOrZero

function oneToken(decimals) {
  decimals = BN.from(decimals).toNumber()
  var s = "1"
  for(var i = 0; i < decimals; ++i) s += "0"
  return BN.from(s)
}
exports.oneToken = oneToken

async function fetchBalancerPoolTokenInfo(vault, balancerPoolID, blockTag="latest") {
  return new Promise((resolve, reject) => {
    withBackoffRetries(() => vault.getPoolTokens(balancerPoolID, {blockTag:blockTag})).then(res => {
      resolve(res)
    }).catch((e)=>{resolve({tokens:[], balances: []})})
  })
}
exports.fetchBalancerPoolTokenInfo = fetchBalancerPoolTokenInfo


async function fetchCurrentEthPrice() {
  var pairAbi = JSON.parse(fs.readFileSync("./data/abi/Uniswap/v2/UniswapV2Pair.json").toString().trim())
  var pairAddress = "0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11" // dai-eth
  var provider = await getProvider(1)
  var pair = new ethers.Contract(pairAddress, pairAbi, provider)
  return new Promise((resolve, reject) => {
    withBackoffRetries(() => pair.getReserves()).then(reserves => {
      resolve(reserves[0].mul(WeiPerEther).div(reserves[1]))
    }).catch((e)=>{reject(e)})
  })
}
exports.fetchCurrentEthPrice = fetchCurrentEthPrice

// given the decimals of a token, returns a bignumber of one token
function decimalsToAmount(decimals) {
  decimals = BN.from(decimals).toNumber()
  var s = '1'
  for(var i = 0; i < decimals; ++i) s += '0'
  return BN.from(s)
}
exports.decimalsToAmount = decimalsToAmount
