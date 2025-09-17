import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { JazzReactProvider } from 'jazz-tools/react'
import { Account } from './jazz/schema'

createRoot(document.getElementById('root')!).render(
  <JazzReactProvider
    sync={{ peer: 'wss://cloud.jazz.tools/?key=andre@uni.minerva.edu', when: 'always' }}
    AccountSchema={Account}
  >
    <App />
  </JazzReactProvider>,
)
