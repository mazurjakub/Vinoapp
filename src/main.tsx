/**
 * File: main.tsx
 * Created: 2026-10-02
 * Description: React entry point that mounts the app with the router and the selected-plot provider.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './i18n'
import './index.css'
import App from './App.tsx'
import { SelectedVineyardProvider } from './state/SelectedVineyardContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SelectedVineyardProvider>
        <App />
      </SelectedVineyardProvider>
    </BrowserRouter>
  </StrictMode>,
)
