import { useEffect, useRef, useState } from 'react'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

interface SyncStateDetail {
  pendingCount: number
  lastSyncAt: string | null
  mode: 'loading' | 'signed-out' | 'online' | 'offline'
}

export function PwaControls() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [syncState, setSyncState] = useState<SyncStateDetail>({ pendingCount: 0, lastSyncAt: null, mode: 'loading' })
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [updateWorker, setUpdateWorker] = useState<ServiceWorker | null>(null)
  const [message, setMessage] = useState('')
  const applyingUpdate = useRef(false)

  useEffect(() => {
    let messageTimeout: number | undefined

    const showTemporaryMessage = (nextMessage: string) => {
      window.clearTimeout(messageTimeout)
      setMessage(nextMessage)
      messageTimeout = window.setTimeout(() => setMessage(''), 4500)
    }
    const handleOnline = () => {
      setIsOnline(true)
      showTemporaryMessage('Conexión recuperada. Los servicios externos vuelven a estar disponibles.')
    }
    const handleOffline = () => {
      window.clearTimeout(messageTimeout)
      setIsOnline(false)
      setMessage('')
    }
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    const handleInstalled = () => {
      setInstallPrompt(null)
      showTemporaryMessage('OPECONCA Campo se instaló correctamente.')
    }
    const handleControllerChange = () => {
      if (applyingUpdate.current) window.location.reload()
    }
    const handleSyncState = (event: Event) => {
      setSyncState((event as CustomEvent<SyncStateDetail>).detail)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('opeconca-sync-state', handleSyncState)
    window.addEventListener('beforeinstallprompt', handleInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    navigator.serviceWorker?.addEventListener('controllerchange', handleControllerChange)

    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      const serviceWorkerUrl = new URL('sw.js', document.baseURI)
      navigator.serviceWorker.register(serviceWorkerUrl).then((registration) => {
        if (registration.waiting) setUpdateWorker(registration.waiting)

        registration.addEventListener('updatefound', () => {
          const worker = registration.installing
          if (!worker) return
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              setUpdateWorker(worker)
            }
          })
        })
      }).catch(() => {
        showTemporaryMessage('No pudimos activar el modo offline en este navegador.')
      })
    }

    return () => {
      window.clearTimeout(messageTimeout)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('opeconca-sync-state', handleSyncState)
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
      navigator.serviceWorker?.removeEventListener('controllerchange', handleControllerChange)
    }
  }, [])

  const installApplication = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'dismissed') setMessage('Puedes instalar OPECONCA Campo más tarde desde el menú del navegador.')
    setInstallPrompt(null)
  }

  const applyUpdate = () => {
    if (!updateWorker) return
    applyingUpdate.current = true
    updateWorker.postMessage({ type: 'SKIP_WAITING' })
  }

  if (!isOnline) {
    return (
      <div aria-live="polite" className="pwa-control offline" role="status">
        <span className="pwa-status-dot" />
        <div><strong>Estás sin conexión</strong><p>{syncState.pendingCount ? `${syncState.pendingCount} cambios esperan sincronización.` : 'Actualidad, tareas, reportes y datos ambientales guardados siguen disponibles.'}</p></div>
      </div>
    )
  }

  if (syncState.pendingCount > 0) {
    return (
      <div aria-live="polite" className="pwa-control message" role="status">
        <span className="pwa-status-dot" />
        <div><strong>Sincronización operativa</strong><p>{syncState.pendingCount} cambios pendientes; se reintentarán automáticamente.</p></div>
      </div>
    )
  }

  if (updateWorker) {
    return (
      <div aria-live="polite" className="pwa-control update" role="status">
        <span className="pwa-status-dot" />
        <div><strong>Nueva versión disponible</strong><p>Actualiza cuando quieras; tus datos locales se conservarán.</p></div>
        <button onClick={applyUpdate} type="button">Actualizar</button>
      </div>
    )
  }

  if (installPrompt) {
    return (
      <div aria-live="polite" className="pwa-control install" role="status">
        <span className="pwa-status-dot" />
        <div><strong>Instala OPECONCA Campo</strong><p>Ábrela como una app y conserva acceso offline.</p></div>
        <button onClick={installApplication} type="button">Instalar</button>
        <button className="pwa-dismiss" onClick={() => setInstallPrompt(null)} type="button">Ahora no</button>
      </div>
    )
  }

  if (message) {
    return <div aria-live="polite" className="pwa-control message" role="status"><span className="pwa-status-dot" /><p>{message}</p></div>
  }

  return null
}
