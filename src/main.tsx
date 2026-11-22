import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app';
import '@joshmarinacci/tooltheme/tooltheme.css';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
