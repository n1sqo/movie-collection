import { render } from 'preact'
import { App } from './app'
import { loadSettings } from './settings'
import { loadBackupSettings, startAutoBackup } from './backup/github'
import './styles.css'

if (navigator.storage?.persist) navigator.storage.persist().catch(() => {})

Promise.all([loadSettings(), loadBackupSettings()])
  .catch(() => {})
  .finally(() => {
    render(<App />, document.getElementById('app')!)
    startAutoBackup()
  })
