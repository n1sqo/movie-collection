import { signal } from '@preact/signals'
import { registerSW } from 'virtual:pwa-register'

/** True when a new version is downloaded and waiting; the banner offers to switch to it. */
export const updateReady = signal(false)

let applyUpdate: (reload?: boolean) => Promise<void> = async () => {}

export function startUpdateCheck(): void {
  applyUpdate = registerSW({
    onNeedRefresh: () => (updateReady.value = true),
    onRegisteredSW: (_url, registration) => {
      // iOS keeps installed apps alive for days; look for a new version every hour and on return.
      if (!registration) return
      setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {})
      })
    }
  })
}

export function reloadToUpdate(): void {
  void applyUpdate(true)
}
