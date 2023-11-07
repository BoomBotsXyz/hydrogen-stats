// responsible for creating HPT metadata and svgs

const { readFile } = require("./../utils/misc")
const { s3PutObjectPromise } = require("./../utils/aws")
const { getNetworkSettings } = require("./../utils/getNetworkSettings")
const { Base64 } = require("./../utils/Base64")

const template = readFile("./data/svg/hpt.hbs")

// note: the random number generator is seeded based on the chainID, nucleusAddress, and poolID
// subsequent runs will generate the same random svg
// different inputs will generate different random svg
function createRandomNumberGenerator(seed) {
  var generate_seed = MurmurHash3(seed)
  var rng = SimpleFastCounter32(generate_seed(), generate_seed(), generate_seed(), generate_seed())
  // burn numbers
  for(var i = 0; i < 32; i++) {
    rng()
  }
  return rng
}

// Define the Murmur3Hash function
function MurmurHash3(string) {
    let i = 0;
    for (i, hash = 1779033703 ^ string.length; i < string.length; i++) {
        let bitwise_xor_from_character = hash ^ string.charCodeAt(i);
        hash = Math.imul(bitwise_xor_from_character, 3432918353);
        hash = hash << 13 | hash >>> 19;
    }
    return () => {
       // Return the hash that you can use as a seed
        hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
        hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
        return (hash ^= hash >>> 16) >>> 0;
    }
}

function SimpleFastCounter32(seed_1, seed_2, seed_3, seed_4) {
    return () => {
      seed_1 >>>= 0; seed_2 >>>= 0; seed_3 >>>= 0; seed_4 >>>= 0;
      let cast32 = (seed_1 + seed_2) | 0;
      seed_1 = seed_2 ^ seed_2 >>> 9;
      seed_2 = seed_3 + (seed_3 << 3) | 0;
      seed_3 = (seed_3 << 21 | seed_3 >>> 11);
      seed_4 = seed_4 + 1 | 0;
      cast32 = cast32 + seed_4 | 0;
      seed_3 = seed_3 + cast32 | 0;
      return (cast32 >>> 0) / 4294967296;
    }
}

function randomInt(rng, min, max) {
  return Math.floor(rng() * (max-min) + min)
}

function randomTextColor(rng) {
  var r = 0
  var g = 0
  var b = 0
  while(r+g+b < 500) {
    r = randomInt(rng, 0, 255)
    g = randomInt(rng, 0, 255)
    b = randomInt(rng, 0, 255)
  }
  return `rgb(${r},${g},${b})`
}

function randomBackgroundColor(rng) {
  var r = 999
  var g = 999
  var b = 999
  while(r+g+b > 400) {
    r = randomInt(rng, 0, 255)
    g = randomInt(rng, 0, 255)
    b = randomInt(rng, 0, 255)
  }
  return `rgb(${r},${g},${b})`
}

function createPoolMetadata(chainID, version, poolID) {
  var networkSettings = getNetworkSettings(chainID)
  var poolIDstr = poolID + ""
  var poolType = poolIDstr.substring(poolIDstr.length-1) == "1" ? "Limit Order Pool" : "Grid Order Pool"
  var metadata = {
    "description": "This NFT represents a Hydrogen Pool. The owner of this NFT can modify the pool and withdraw its tokens.",
    "external_url": `https://analytics.hydrogendefi.xyz/#/${networkSettings.chainNameAnalytics}/pools/${poolID}`,
    "image": `https://assets.hydrogendefi.xyz/hpt/${chainID}/${version}/${poolID}.svg`,
    "name": `Hydrogen Pool Token #${poolID}`,
    "attributes": [{
      "trait_type": "Pool Type",
      "value": poolType
    }]
  }
  return metadata
}

function createP0(rng) {
  var color0 = randomBackgroundColor(rng)
  return Base64.encode(`<svg width="350" height="350" viewBox="0 0 350 350" xmlns="http://www.w3.org/2000/svg"><rect width="350px" height="350px" fill="${color0}"></rect></svg>`)
}

function createP1(rng) {
  var color1 = randomBackgroundColor(rng)
  var x1 = randomInt(rng, 0, 350)
  var y1 = randomInt(rng, 0, 350)
  return Base64.encode(`<svg width="350" height="350" viewBox="0 0 350 350" xmlns="http://www.w3.org/2000/svg"><circle cx="${x1}" cy="${y1}" r="120px" fill="${color1}"/></svg>`)
}

function createP2(rng) {
  var color2 = randomBackgroundColor(rng)
  var x2 = randomInt(rng, 0, 350)
  var y2 = randomInt(rng, 0, 350)
  return Base64.encode(`<svg width="350" height="350" viewBox="0 0 350 350" xmlns="http://www.w3.org/2000/svg"><circle cx="${x2}" cy="${y2}" r="120px" fill="${color2}"/></svg>`)
}

function createP3(rng) {
  var color3 = randomBackgroundColor(rng)
  var x3 = randomInt(rng, 0, 350)
  var y3 = randomInt(rng, 0, 350)
  return Base64.encode(`<svg width="350" height="350" viewBox="0 0 350 350" xmlns="http://www.w3.org/2000/svg"><circle cx="${x3}" cy="${y3}" r="100px" fill="${color3}"/></svg>`)
}

function createPoolImage(chainID, poolID, rng) {
  var p0 = createP0(rng)
  var p1 = createP1(rng)
  var p2 = createP2(rng)
  var p3 = createP3(rng)
  var poolIDstr = poolID + ""
  var networkSettings = getNetworkSettings(chainID)
  var chainName = networkSettings.chainName
  var textColor = randomTextColor(rng)
  var chainNameX = 350 - 36 - chainName.length * 10
  var svg = (template
    .replace(/{{p0}}/g, p0)
    .replace(/{{p1}}/g, p1)
    .replace(/{{p2}}/g, p2)
    .replace(/{{p3}}/g, p3)
    .replace(/{{textColor}}/g, textColor)
    .replace(/{{poolID}}/g, poolIDstr)
    .replace(/{{chainName}}/g, chainName)
    .replace(/{{chainNameX}}/g, chainNameX)
  )
  return svg
}

async function storePool(chainID, nucleusAddress, version, poolID) {
  // assumes chainID, nucleusAddress, and poolID already verified
  var rng = createRandomNumberGenerator(`${chainID}_${nucleusAddress}_${poolID}`)
  var metadata = createPoolMetadata(chainID, version, poolID)
  var svg = createPoolImage(chainID, poolID, rng)
  // write to s3
  await Promise.all([
    s3PutObjectPromise({ Bucket: "stats.hydrogendefi.xyz.data", Key: `${chainID}/hpt_metadata/${version}/${poolID}.json`, Body: JSON.stringify(metadata), ContentType: "application/json" }),
    s3PutObjectPromise({ Bucket: "assets.hydrogendefi.xyz", Key: `hpt/${chainID}/${version}/${poolID}.svg`, Body: svg, ContentType: "image/svg+xml", CacheControl: "max-age=864000"})
  ])
}
exports.storePool = storePool
