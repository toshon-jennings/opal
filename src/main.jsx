import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { installRedactedConsole } from './lib/redactConsole.js'

import { ModeProvider } from './context/ModeContext'

installRedactedConsole()

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <ModeProvider>
            <App />
        </ModeProvider>
    </React.StrictMode>,
)
