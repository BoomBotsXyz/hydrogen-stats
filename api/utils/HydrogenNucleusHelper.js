const ethers = require("ethers")
const BN = ethers.BigNumber
const { getAddress, hexlify, zeroPad } = ethers.utils
const { Zero, AddressZero } = ethers.constants

const { toBytes32, rightPad } = require("./strings")
const { decimalsToAmount } = require("./price")

const MaxUint128 = BN.from(2).pow(128).sub(1);
const MAX_PPM = BN.from(1_000_000); // parts per million

const ABI_ERC20_MIN = [{"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"}];

//export default class HydrogenNucleusHelper {
class HydrogenNucleusHelper {

  // location functions

  // encode an external address as a location
  static externalAddressToLocation(address) {
    var addr = address.substring(2).toLowerCase();
    while(addr.length < 62) addr = `0${addr}`;
    addr = `0x01${addr}`;
    return addr;
  }

  // encode an internal address as a location
  static internalAddressToLocation(address) {
    var addr = address.substring(2).toLowerCase();
    while(addr.length < 62) addr = `0${addr}`;
    addr = `0x02${addr}`;
    return addr;
  }

  // encode a poolID as a location
  static poolIDtoLocation(poolID) {
    var num = BN.from(poolID).toHexString();
    num = num.substring(2);
    while(num.length < 62) num = `0${num}`;
    num = `0x03${num}`;
    return num;
  }

  // create a human readable description of a location
  static locationToString(loc) {
    if(loc.length != 66) return `invalid location ${loc}`;
    if(loc.substring(0,4) === "0x01") {
      if(loc.substring(4, 26) != "0000000000000000000000") return `invalid location ${loc}`;
      var addr = getAddress(`0x${loc.substring(26,66)}`);
      return `${addr} external balance`;
    } else if(loc.substring(0,4) === "0x02") {
      if(loc.substring(4, 26) != "0000000000000000000000") return `invalid location ${loc}`;
      var addr = getAddress(`0x${loc.substring(26,66)}`);
      return `${addr} internal balance`;
    } else if(loc.substring(0,4) === "0x03") {
      var poolID = BN.from(`0x${loc.substring(4,66)}`);
      return `poolID ${poolID}`;
    } else return `invalid location ${loc}`;
  }

  // exchange rate functions

  // encodes an exchange rate
  static encodeExchangeRate(exchangeRateX1, exchangeRateX2) {
    var x1 = BN.from(exchangeRateX1);
    var x2 = BN.from(exchangeRateX2);
    if(x1.gt(MaxUint128) || x2.gt(MaxUint128)) throw(`HydrogenNucleusHelper: cannot encode exchange rate. Received ${x1.toString()}, ${x2.toString()}. Max ${MaxUint128.toString()}`);
    var exchangeRate = toBytes32(x1.shl(128).add(x2));
    return exchangeRate;
  }

  // decodes an exchange rate
  static decodeExchangeRate(exchangeRate) {
    // decode exchange rate
    var er = BN.from(exchangeRate);
    var x1 = er.shr(128);
    var x2 = er.and(MaxUint128);
    return [x1, x2];
  }

  // returns true if the exchange rate is non zero
  static exchangeRateIsNonzero(exchangeRate) {
    const [x1, x2] = HydrogenNucleusHelper.decodeExchangeRate(exchangeRate);
    if(x1.lte(0) || x2.lte(0)) return false;
    return true;
  }

  // creates human readable descriptions of an exchange rate
  static calculateRelativeAmounts(amountA, decimalsA, amountB, decimalsB) {
    const amountAperB = BN.from(amountA).mul(decimalsToAmount(decimalsB)).div(amountB);
    const amountBperA = BN.from(amountB).mul(decimalsToAmount(decimalsA)).div(amountA);
    return { amountAperB, amountBperA }
  }

  // swap calculators

  // as market maker
  static calculateAmountA(amountB, exchangeRate) {
    const [x1, x2] = HydrogenNucleusHelper.decodeExchangeRate(exchangeRate);
    if(x1.lte(0) || x2.lte(0)) throw("HydrogenNucleusHelper: pool cannot exchange these tokens");
    // amountA = floor( (amountB * x1) / x2 )
    var amtB = BN.from(amountB);
    var amountA = amtB.mul(x1).div(x2);
    return amountA;
  }

  // as market maker
  static calculateAmountB(amountA, exchangeRate) {
    const [x1, x2] = HydrogenNucleusHelper.decodeExchangeRate(exchangeRate);
    if(x1.lte(0) || x2.lte(0)) throw("HydrogenNucleusHelper: pool cannot exchange these tokens");
    // amountB = ceil( (amountA * x2) / x1 )
    var amtA = BN.from(amountA);
    var numerator = amtA.mul(x2);
    var amountB = numerator.div(x1);
    if(numerator.mod(x1).gt(0)) amountB = amountB.add(1);
    return amountB;
  }

  // as market taker
  static calculateMarketOrderExactAMT(amountAMT, exchangeRate, feePPM) {
    var amountAMM = BN.from(amountAMT);
    var amountBMM = this.calculateAmountB(amountAMM, exchangeRate);
    var amountBMT = amountBMM.mul(MAX_PPM).div(MAX_PPM.sub(feePPM));
    var amountBFR = amountBMT.mul(feePPM).div(MAX_PPM);
    return { amountAMM, amountBMM, amountBMT, amountBFR };
  }

  // as market taker
  static calculateMarketOrderExactBMT(amountBMT, exchangeRate, feePPM) {
    amountBMT = BN.from(amountBMT);
    var amountBFR = amountBMT.mul(feePPM).div(MAX_PPM);
    var amountBMM = amountBMT.sub(amountBFR);
    var amountAMM = this.calculateAmountA(amountBMM, exchangeRate);
    var amountAMT = amountAMM;
    return { amountAMM, amountAMT, amountBMM, amountBFR };
  }

  // swap fees

  static getSwapFeeForPair(nucleusState, tokenA, tokenB) {
    var feePPM = Zero;
    var receiverLocation = toBytes32(0);
    var swapFees = nucleusState.swapFees;
    if(feePPM.eq(Zero)) {
      try {
        feePPM = BN.from(swapFees[tokenA][tokenB].feePPM);
        receiverLocation = BN.from(swapFees[tokenA][tokenB].receiverLocation);
      } catch(e) {}
    }
    if(feePPM.eq(Zero)) {
      try {
        feePPM = BN.from(swapFees[AddressZero][AddressZero].feePPM);
        receiverLocation = BN.from(swapFees[AddressZero][AddressZero].receiverLocation);
      } catch(e) {}
    }
    if(feePPM.gte(MAX_PPM)) {
      feePPM = Zero;
      receiverLocation = toBytes32(0);
    }
    return { feePPM, receiverLocation };
  }
}
exports.HydrogenNucleusHelper = HydrogenNucleusHelper
