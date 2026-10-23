import { signal } from '@preact/signals'
import { useEffect } from 'preact/hooks'

interface ToastState {
  id: number
  text: string
  action?: { label: string; run: () => void }
}

const toast = signal<ToastState | null>(null)
let nextId = 0

export function showToast(text: string, action?: ToastState['action']): void {
  toast.value = { id: ++nextId, text, action }
}

export function ToastHost() {
  const current = toast.value
  useEffect(() => {
    if (!current) return
    const timer = setTimeout(() => {
      if (toast.value?.id === current.id) toast.value = null
    }, 5000)
    return () => clearTimeout(timer)
  }, [current?.id])
  if (!current) return null
  return (
    <div class="toast" role="status">
      <span>{current.text}</span>
      {current.action && (
        <button
          class="toast-action"
          onClick={() => {
            current.action!.run()
            toast.value = null
          }}
        >
          {current.action.label}
        </button>
      )}
    </div>
  )
}
