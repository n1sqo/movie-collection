import { signal } from '@preact/signals'

export const online = signal(navigator.onLine)

window.addEventListener('online', () => (online.value = true))
window.addEventListener('offline', () => (online.value = false))
