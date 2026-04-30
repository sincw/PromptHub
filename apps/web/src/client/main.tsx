import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';
import '@web-runtime-globals-css';
import '@web-runtime-i18n';

document.documentElement.classList.add('prompthub-web-runtime');
document.body.classList.add('prompthub-web-runtime');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
