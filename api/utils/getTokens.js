/*import fs from "fs"

export function getTokenList(chainID:any) {
  return JSON.parse(fs.readFileSync(`./data/tokens/${chainID}.json`).toString())
}
exports.getTokenList = getTokenList

export function getTokensByAddress(chainID:any) {
  const tokenList = getTokenList(chainID)
  const d:any = {}
  tokenList.forEach((token:any) => d[token.address] = token)
  return d
}
exports.getTokensByAddress = getTokensByAddress

export function getTokensBySymbol(chainID:any) {
  const tokenList = getTokenList(chainID)
  const d:any = {}
  tokenList.forEach((token:any) => d[token.symbol] = token)
  return d
}
exports.getTokensBySymbol = getTokensBySymbol
*/

function getTokensByAddress(tokenMetadataList) {
  try {
    var tokensByAddress = {}
    tokenMetadataList.forEach(token => tokensByAddress[token.address] = token)
    return tokensByAddress
  } catch(e) {
    throw new Error(`Error in getTokensByAddress()\n${tokenMetadataList}\n${e.toString()}`)
  }
}
exports.getTokensByAddress = getTokensByAddress

function getTokensBySymbol(tokenMetadataList) {
  try {
    var tokensBySymbol = {}
    tokenMetadataList.forEach(token => tokensBySymbol[token.symbol] = token)
    return tokensBySymbol
  } catch(e) {
    throw new Error(`Error in getTokensBySymbol()\n${tokenMetadataList}\n${e.toString()}`)
  }
}
exports.getTokensBySymbol = getTokensBySymbol
