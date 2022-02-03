import twitterLogo from './assets/twitter-logo.svg';
import './App.css';
import { useState } from 'react';

// Constants
const TWITTER_HANDLE = '_buildspace';
const TWITTER_LINK = `https://twitter.com/${TWITTER_HANDLE}`;

const App = () => {
  const {inputValue, setInputValue}  = useState('')
  return (
    <div className="App">
      <div className="container">
        <div className="header-container">
          <p className="header">🖼 GIF Portal</p>
          <p className="sub-text">
            View your GIF collection in the metaverse ✨
          </p>
        </div>
        <div className="footer-container">
          <img alt="Twitter Logo" className="twitter-logo" src={twitterLogo} />
          <a
            className="footer-text"
            href={TWITTER_LINK}
            target="_blank"
            rel="noreferrer"
          >{`built on @${TWITTER_HANDLE}`}</a>

          <input type="text" placeholder="Enter gif link!" 
            value={inputValue}
            onChange={({target}) => setInputValue(target.value)}/>
          <button type="submit" className="cta-button submit-gif-button">Submit</button>
        </div>
      </div>
    </div>
  );
};

export default App;
