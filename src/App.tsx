import React from 'react';
import logo from './logo.svg';
import './App.css';
import Amplify from 'aws-amplify';
import awsconfig from './aws-exports';
import { withAuthenticator } from 'aws-amplify-react';

Amplify.configure(awsconfig);

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.tsx</code> and save to reload.
        </p>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
      </header>
    </div>
  );
}

const signUpConfig = {
  //hiddenDefaults: ['phone_number', 'email'],
  hideAllDefaults: true,
  signUpFields: [
    {
      label: 'Username (Email)',
      key: 'username',
      required: true,
      displayOrder: 1,
      type: 'email'
    },
    {
      label: 'Password',
      key: 'password',
      required: true,
      displayOrder: 2,
      type: 'password'
    },
    {
      label: 'Display Name',
      key: 'name',
      required: false,
      displayOrder: 3,
      type: 'string'
    }
  ]
};

//@ts-ignore https://dev.classmethod.jp/cloud/aws/aws-amplify-react-auth/
export default withAuthenticator(App, { signUpConfig });
