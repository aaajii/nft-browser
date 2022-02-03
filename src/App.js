import { useState } from 'react'
import { Connection, PublicKey } from '@solana/web3.js'
import { bs58 } from '@project-serum/anchor/dist/cjs/utils/bytes'
import './App.css';

const App = () => {
  const [inputValue, setAddressValue] = useState(null)
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
  const updateAuthority = '53LS1oDAWmCMFaezgYqwprEwM1Ginrxj5SVDK6AaU7gB'
  const clusterURL = 'https://nftarmory.genesysgo.net'

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
    console.log(rawMetadatas)
  }

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
