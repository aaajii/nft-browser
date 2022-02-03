import axios from 'axios'
import { useState } from 'react'
import { Account } from '@metaplex/js';
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { Token, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import {
  Edition,
  MasterEdition,
  Metadata,
  MetadataKey,
} from '@metaplex-foundation/mpl-token-metadata'
import { bs58 } from '@project-serum/anchor/dist/cjs/utils/bytes'

// CONSTANTS
const metaDataKey = 4
const baseFilters = [
  // Filter for MetadataV1 by key
  {
    memcmp: {
      offset: 0,
      bytes: bs58.encode(Buffer.from([metaDataKey])),
    },
  },
].filter(Boolean)
const metaDataProgramID = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'
const fractals = '53LS1oDAWmCMFaezgYqwprEwM1Ginrxj5SVDK6AaU7gB'
const solsisters = 'B3Mu9hdhMfBpnUo2m3UbJXNwipUKEtUQTvFsWEPaqYh3'
const clusterURL = 'https://nftarmory.genesysgo.net'

// FUNCTIONS

function filterOutIncompleteNFTs(NFTs) {
  return NFTs.filter(
    (n) =>
      n.mint && // guaranteed
      n.metadataOnchain && // guaranteed
      n.metadataExternal // requirement, otherwise no picture
  )
}

function deserializeMetadata(rawMetadata) {
  const acc = new Account(rawMetadata.pubkey, rawMetadata.account)
  return Metadata.from(acc)
}

async function getHolderByMint(mint) {
  const tokens = await getConnection().getTokenLargestAccounts(mint)
  return tokens.value[0].address // since it's an NFT, we just grab the 1st account
}

const metadatasToTokens = async (rawMetadatas) => {
  const promises = await Promise.all(
    rawMetadatas.map(async (m) => {
      try {
        const metadata = deserializeMetadata(m)
        const mint = new PublicKey(metadata.data.mint)
        const address = await getHolderByMint(mint)
        return {
          mint,
          address,
          metadataPDA: metadata.pubkey,
          metadataOnchain: metadata.data,
        }
      } catch (e) {
        console.log('failed to deserialize one of the fetched metadatas', e)
      }
    })
  )
  return promises.filter((t) => !!t)
}

function isPresent(dictKey, dict) {
  return dictKey in dict
}

function countAttributes(files) {
  const counterDicts = {}
  for (const f of files) {
    const { attributes } = f.metadataExternal
    if (!isIterable(attributes)) {
      continue
    }

    for (const attribute of attributes) {
      const dictName = attribute.trait_type
      const dictEntry = attribute.value

      if (isPresent(dictName, counterDicts)) {
        if (isPresent(dictEntry, counterDicts[dictName])) {
          counterDicts[dictName][dictEntry] += 1
        } else {
          counterDicts[dictName][dictEntry] = 1
        }
      } else {
        counterDicts[dictName] = {}
        counterDicts[dictName][dictEntry] = 1
      }
    }
  }
  // console.log(counterDicts)
  return counterDicts
}

function calcRarityScores(counterDicts, fileCount) {
  console.log('length is', fileCount)
  const rarityScoreDicts = {}
  for (const [attrName, attrDict] of Object.entries(counterDicts)) {
    rarityScoreDicts[attrName] = {}
    for (const [attrEntry, attrCount] of Object.entries(attrDict)) {
      rarityScoreDicts[attrName][attrEntry] = 1 / (attrCount / fileCount)
    }
  }
  // console.log(rarityScoreDicts)
  return rarityScoreDicts
}

function isIterable(value) {
  return Symbol.iterator in Object(value)
}

// Enum
const RarityCategory = {
  Legendary: 'legendary',
  Epic: 'epic',
  Rare: 'rare',
  Uncommon: 'uncommon',
  Common: 'common',
}

function assignRarityCategory(itemRank, totalItems) {
  const percentile = (itemRank / totalItems) * 100
  if (percentile <= 1) {
    return RarityCategory.Legendary
  }
  if (percentile <= 5) {
    return RarityCategory.Epic
  }
  if (percentile <= 20) {
    return RarityCategory.Rare
  }
  if (percentile <= 40) {
    return RarityCategory.Uncommon
  }
  return RarityCategory.Common
}

function rankFilesByRarity(files, rarityDicts) {
  const scoredFiles = [...files]
  for (const f of scoredFiles) {
    f.rarityScore = 0
    const { attributes } = f.metadataExternal
    if (!isIterable(attributes)) {
      continue
    }

    for (const attribute of attributes) {
      f.rarityScore += rarityDicts[attribute.trait_type][attribute.value]
    }
  }
  const sortedScoredFiles = scoredFiles.sort(
    (first, second) => second.rarityScore - first.rarityScore
  )
  for (const [i, el] of sortedScoredFiles.entries()) {
    el.rarityRank = i
    el.rarityCategory = assignRarityCategory(i, files.length)
  }
  // console.log(sortedScoredFiles.splice(0, 10))
  return sortedScoredFiles
}

function processRarity(files) {
  const t1 = performance.now()

  const attrs = countAttributes(files)
  const t2 = performance.now()

  const rarityDicts = calcRarityScores(attrs, files.length)
  const t3 = performance.now()

  const rankedFiles = rankFilesByRarity(files, rarityDicts)
  const t4 = performance.now()

  console.log('time to count attrs', (t2 - t1) / 1000)
  console.log('time to count rarity scores', (t3 - t2) / 1000)
  console.log('time to rank files', (t4 - t3) / 1000)
  console.log('tital time', (t4 - t1) / 1000)

  return rankedFiles
}

const getConnection = (committment) =>
  new Connection(clusterURL, committment ?? 'processed')

const getNFTs = async (updateAuthority) => {
  console.log('Pulling NFTs from:', updateAuthority)
  const rawMetadatas = await getConnection().getProgramAccounts(
    new PublicKey(metaDataProgramID),
    {
      filters: [
        ...baseFilters,
        {
          memcmp: {
            offset: 1,
            bytes: bs58.encode(bs58.decode(updateAuthority)),
          },
        },
      ],
    }
  )

  debugger

  const tokens = await metadatasToTokens(rawMetadatas)
  debugger
  const nfts = await tokensToEnrichedNFTs(tokens)

  debugger

  const validNFTs = filterOutIncompleteNFTs(nfts)

  const finalNFTs = processRarity(validNFTs)
  debugger
  console.log(finalNFTs)
}

const deserializeToken = async (mintPubkey) => {
  // doesn't matter which keypair goes here, we're not using it for anything. This one is long dox'ed.
  const tempKeypair = Keypair.fromSecretKey(
    Uint8Array.from([
      208, 175, 150, 242, 88, 34, 108, 88, 177, 16, 168, 75, 115, 181, 199, 242,
      120, 4, 78, 75, 19, 227, 13, 215, 184, 108, 226, 53, 111, 149, 179, 84,
      137, 121, 79, 1, 160, 223, 124, 241, 202, 203, 220, 237, 50, 242, 57, 158,
      226, 207, 203, 188, 43, 28, 70, 110, 214, 234, 251, 15, 249, 157, 62, 80,
    ])
  )
  return new Token(getConnection(), mintPubkey, TOKEN_PROGRAM_ID, tempKeypair)
}

const okToFailAsync = async (callback, args, wantObject = false) => {
  try {
    // mandatory await here, can't just pass down (coz we need to catch error in this scope)
    return await callback(...args)
  } catch (e) {
    console.log(`Oh no! ${callback.name} called with ${args} blew up!`)
    console.log('Full error:', e)
    return wantObject ? {} : undefined
  }
}

const deserializeTokenAccount = async (mintPubkey, tokenAccountPubkey) => {
  const t = await deserializeToken(mintPubkey)
  return t.getAccountInfo(tokenAccountPubkey)
}

const deserializeTokenMint = async (mintPubkey) => {
  const t = await deserializeToken(mintPubkey)
  return t.getMintInfo()
}

const getMetadataByMint = async (mint, metadataPDA, metadataOnchain) => {
  const pda = metadataPDA ?? (await Metadata.getPDA(mint))
  const onchain =
    metadataOnchain ?? (await Metadata.load(getConnection(), pda)).data
  const metadataExternal = (await axios.get(onchain.data.uri)).data
  return {
    metadataPDA: pda,
    metadataOnchain: onchain,
    metadataExternal,
  }
}

const tokensToEnrichedNFTs = async (tokens) => {
  return Promise.all(
    tokens.map(async (t) =>
      // console.log(`Processing Mint ${t.mint}`)
      ({
        mint: t.mint,
        address: t.address,
        splTokenInfo: await okToFailAsync(deserializeTokenAccount, [
          t.mint,
          t.address,
        ]),
        splMintInfo: await okToFailAsync(deserializeTokenMint, [t.mint]),
        ...(await okToFailAsync(
          getMetadataByMint,
          [t.mint, t.metadataPDA, t.metadataOnchain],
          true
        )),
        ...(await okToFailAsync(getEditionInfoByMint, [t.mint], true)),
      })
    )
  )
}

const getEnumKeyByEnumValue = async (myEnum, enumValue) => {
  const keys = Object.keys(myEnum).filter((x) => myEnum[x] == enumValue)
  return keys.length > 0 ? keys[0] : null
}

const getParentEdition = async (editionData) => {
  const masterEditionPDA = new PublicKey(editionData.parent)
  const masterInfo = await Account.getInfo(getConnection(), masterEditionPDA)
  const masterEditionData = new MasterEdition(masterEditionPDA, masterInfo).data
  return { masterEditionPDA, masterEditionData }
}

const getEditionInfoByMint = async (mint) => {
  // untriaged
  const pda = await Edition.getPDA(mint)
  const info = await Account.getInfo(getConnection(), pda)
  const key = info?.data[0]

  const editionType = getEnumKeyByEnumValue(MetadataKey, key)
  let editionPDA
  let editionData
  let masterEditionPDA
  let masterEditionData

  // triaged
  // eslint-disable-next-line default-case
  switch (key) {
    case MetadataKey.EditionV1:
      editionPDA = pda
      editionData = new Edition(pda, info).data
      // we can further get master edition info, since we know the parent
      ;({ masterEditionPDA, masterEditionData } = await okToFailAsync(
        getParentEdition,
        [editionData]
      ))
      break
    case MetadataKey.MasterEditionV1:
    case MetadataKey.MasterEditionV2:
      masterEditionData = new MasterEdition(pda, info).data
      masterEditionPDA = pda
      break
  }

  return {
    editionType,
    editionPDA,
    editionData,
    masterEditionPDA,
    masterEditionData,
  }
}

const App = () => {
  const [inputValue, setAddressValue] = useState(null)

  return (
    <div className="App">
      <div className="container">
        <div className="header-container">
          <input type="text" placeholder="enter address here" 
          value={inputValue}
          onChange={({target}) => setAddressValue(target.value)}/>
          <button
            type="submit"
            className="cta-button submit-gif-button"
            onClick={() => getNFTs(inputValue)}
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
