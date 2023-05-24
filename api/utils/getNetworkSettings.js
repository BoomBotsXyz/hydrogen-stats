// chainlist
// 1: ethereum
// 5: goerli
// 111555111: sepolia
// 137: polygon
// 80001: polygon mumbai
// 1313161554: aurora
// 1313161555: aurora testnet
// 31337: hardhat testnet

// given a chainID, returns some settings to use for the network
function getNetworkSettings(chainID) {
  //const KNOWN_CHAINS = [1, 5, 111555111, 137, 80001, 1313161554, 1313161555];
  const KNOWN_CHAINS = [80001];
  if(!KNOWN_CHAINS.includes(chainID)) throw new Error(`chainID '${chainID}' not supported`);

  // name of each chain
  const CHAIN_NAMES = {
    [1]: "Ethereum",
    [5]: "Goerli",
    [111555111]: "Sepolia",
    [137]: "Polygon",
    [80001]: "Mumbai",
    [1313161554]: "Aurora",
    [1313161555]: "AuroraTestnet"
  };
  let chainName = CHAIN_NAMES.hasOwnProperty(chainID) ? CHAIN_NAMES[chainID] : "unknown";

  // number of blocks to wait to ensure finality
  const CONFIRMATIONS = {
    [1]: 1,
    [5]: 1,
    [111555111]: 1,
    [137]: 5,
    [80001]: 5,
    [1313161554]: 5,
    [1313161555]: 5
  };
  let confirmations = CONFIRMATIONS.hasOwnProperty(chainID) ? CONFIRMATIONS[chainID] : 1;

  // testnets
  const TESTNETS = [5, 111555111, 80001, 1313161555];
  let isTestnet = TESTNETS.includes(chainID);

  // used to debounce s3 writes. if no events were found, only write to s3 every x blocks
  // this DOES NOT mean only scan if at least x blocks occured since last scan
  const MIN_SCAN_WRITE_BLOCKS = { // approximately 5 minutes
    [1]: 25,
    [5]: 25,
    [111555111]: 25,
    [137]: 150,
    [80001]: 150,
    [1313161554]: 150,
    [1313161555]: 150
  };
  let minScanWriteBlocks = MIN_SCAN_WRITE_BLOCKS.hasOwnProperty(chainID) ? MIN_SCAN_WRITE_BLOCKS[chainID] : 0;

  let networkSettings = {chainName, confirmations, isTestnet, minScanWriteBlocks};
  return networkSettings;
}
exports.getNetworkSettings = getNetworkSettings
