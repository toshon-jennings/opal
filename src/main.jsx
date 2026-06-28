import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { installRedactedConsole } from './lib/redactConsole.js'
import { ensureHydrated } from './lib/persistentStore'

import { ModeProvider } from './context/ModeContext'

installRedactedConsole()

// Load persisted data (Electron appData or localStorage) before rendering
// so that components like Mission Control see real stored state on startup.
ensureHydrated().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <ModeProvider>
        <App />
      </ModeProvider>
    </React.StrictMode>,
  )
})
