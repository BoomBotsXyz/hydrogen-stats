// responsible for creating HPT metadata and svgs

const { s3PutObjectPromise } = require("./../../utils/aws")
const { readFile } = require("./../../utils/misc")

const template = readFile("./data/svg/hpt.hbs")

async function createPoolMetadata(chainID, poolID) {
  // assumes chainID and poolID already verified
  // misc
  let poolIDstr = poolID + ""
  let chainIDstr = chainID + ""
  let poolType = poolIDstr.substring(poolIDstr.length-1) == "1" ? "Limit Order Pool" : "Grid Order Pool"
  // metadata
  let metadata = {
    "description": "This NFT represents a Hydrogen Pool. The owner of this NFT can modify the pool and withdraw its tokens.",
    "external_url": `https://analytics.hydrogen.hysland.finance/pools/?chainID=${chainIDstr}&poolID=${poolIDstr}`,
    "image": `https://assets.hysland.finance/hydrogen/hpt/${chainIDstr}/${poolIDstr}.svg`,
    "name": `Hydrogen Pool Token #${poolIDstr}`,
    "attributes": [{
      "trait_type": "Pool Type",
      "value": poolType
    }]
  }
  // svg
  let poolID_box_width = 92 + 7 * poolIDstr.length
  let chainID_box_width = 99 + 7 * chainIDstr.length
  let svg = (template
    .replace("{{poolID}}", poolIDstr)
    .replace("{{chainID}}", chainIDstr)
    .replace("{{poolID_box_width}}", poolID_box_width)
    .replace("{{chainID_box_width}}", chainID_box_width)
  )
  // write to s3
  await Promise.all([
    s3PutObjectPromise({ Bucket: 'stats.hydrogen.hysland.finance.data', Key: `${chainIDstr}/hpt_metadata/${poolIDstr}.json`, Body: JSON.stringify(metadata), ContentType: "application/json" }),
    s3PutObjectPromise({ Bucket: "assets.hysland.finance", Key: `hydrogen/hpt/${chainIDstr}/${poolIDstr}.svg`, Body: svg, ContentType: "image/svg+xml"})
  ])
}
exports.createPoolMetadata = createPoolMetadata
