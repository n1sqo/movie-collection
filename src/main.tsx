import { render } from 'preact'
import { App } from './app'
import './styles.css'

if (navigator.storage?.persist) navigator.storage.persist().catch(() => {})

render(<App />, document.getElementById('app')!)
