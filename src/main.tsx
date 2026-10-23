import { render } from 'preact'
import { App } from './app'
import { loadSettings } from './settings'
import './styles.css'

if (navigator.storage?.persist) navigator.storage.persist().catch(() => {})

loadSettings()
  .catch(() => {})
  .finally(() => render(<App />, document.getElementById('app')!))
