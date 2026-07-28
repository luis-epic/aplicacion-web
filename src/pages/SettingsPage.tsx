import { useRef, useState } from 'react'
import type {
  AppPreferences,
  NotificationPermissionState,
  PersonalizationProfile,
  StorageStatus,
} from '../types/app'
import { Icon } from '../components/Icon'

interface SettingsPageProps {
  notificationMessage: string
  notificationPermission: NotificationPermissionState
  personalization: PersonalizationProfile
  preferences: AppPreferences
  storageStatus: StorageStatus
  storageMessage: string
  onClearLocalData: () => Promise<void>
  onPreferencesChange: (preferences: AppPreferences) => void
  onResetPersonalization: () => void
  onToggleNotifications: () => void
}

const permissionLabels: Record<NotificationPermissionState, string> = {
  granted: 'Permitidas',
  denied: 'Bloqueadas',
  default: 'Sin decidir',
  unsupported: 'No compatible',
}

export function SettingsPage({
  notificationMessage,
  notificationPermission,
  personalization,
  preferences,
  storageStatus,
  storageMessage,
  onClearLocalData,
  onPreferencesChange,
  onResetPersonalization,
  onToggleNotifications,
}: SettingsPageProps) {
  const updatePreference = <Key extends keyof AppPreferences>(
    key: Key,
    value: AppPreferences[Key],
  ) => onPreferencesChange({ ...preferences, [key]: value })

  const habits = Object.values(personalization.habits)
  const learnedItems = habits.filter((habit) => habit.addedCount >= 2).length
  const recurringPending = habits.filter((habit) => habit.pendingReviewCount >= 2).length
  const [showClearConfirmation, setShowClearConfirmation] = useState(false)
  const [isClearingData, setIsClearingData] = useState(false)
  const [clearMessage, setClearMessage] = useState('')
  const clearDataTriggerRef = useRef<HTMLButtonElement>(null)

  const restoreClearDataFocus = () => {
    window.requestAnimationFrame(() => clearDataTriggerRef.current?.focus())
  }

  const cancelClearLocalData = () => {
    setShowClearConfirmation(false)
    restoreClearDataFocus()
  }

  const handleClearLocalData = async () => {
    setIsClearingData(true)
    setClearMessage('')

    try {
      await onClearLocalData()
      setShowClearConfirmation(false)
      setClearMessage('Datos locales eliminados. OPECONCA Campo volvió a su estado inicial.')
      restoreClearDataFocus()
    } catch (error) {
      setClearMessage(
        error instanceof Error ? error.message : 'No pudimos borrar los datos locales.',
      )
    } finally {
      setIsClearingData(false)
    }
  }

  return (
    <div className="page settings-page">
      <header className="page-header">
        <span className="eyebrow">A tu manera</span>
        <h1>Ajustes</h1>
        <p>Define cómo quieres preparar y consultar tus salidas.</p>
      </header>

      <div className={`storage-banner ${storageStatus}`} role="status">
        {storageStatus === 'saving' && <span className="loading-spinner" />}
        {storageStatus !== 'saving' && <span className="storage-dot" />}
        <div><strong>{storageStatus === 'error' ? 'Almacenamiento no disponible' : 'Guardado automático'}</strong><p>{storageMessage}</p></div>
      </div>

      <div className="settings-layout">
        <div className="settings-stack">
          <section className="settings-card">
            <div className="settings-title"><span><Icon name="location" /></span><div><h2>Ubicación y clima</h2><p>Valores que usaremos como alternativa.</p></div></div>
            <div className="settings-fields">
              <label className="field"><span>Ciudad predeterminada</span><input onChange={(event) => updatePreference('defaultCity', event.target.value)} value={preferences.defaultCity} /></label>
              <label className="field"><span>Unidad de temperatura</span><select onChange={(event) => updatePreference('temperatureUnit', event.target.value as AppPreferences['temperatureUnit'])} value={preferences.temperatureUnit}><option value="celsius">Celsius (°C)</option><option value="fahrenheit">Fahrenheit (°F)</option></select></label>
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-title"><span><Icon name="settings" /></span><div><h2>Recomendaciones</h2><p>Controla el nivel de ayuda de la aplicación.</p></div></div>
            <div className="setting-row">
              <div><strong>Sugerencias contextuales</strong><p>Añade objetos según actividad, duración y clima.</p></div>
              <button aria-checked={preferences.suggestions} aria-label="Sugerencias contextuales" className={preferences.suggestions ? 'switch active' : 'switch'} onClick={() => updatePreference('suggestions', !preferences.suggestions)} role="switch" type="button"><span /></button>
            </div>
            <div className="setting-row notification-setting">
              <div>
                <strong>Recordatorio al cambiar de pestaña</strong>
                <p>Si dejas una checklist incompleta, mostraremos un aviso del sistema.</p>
                <span className={`permission-chip ${notificationPermission}`}>{permissionLabels[notificationPermission]}</span>
                {notificationMessage && <p className="notification-message" role="status">{notificationMessage}</p>}
              </div>
              <button
                aria-checked={preferences.notifications}
                aria-label="Recordatorios del navegador"
                className={preferences.notifications ? 'switch active' : 'switch'}
                onClick={onToggleNotifications}
                role="switch"
                type="button"
              ><span /></button>
            </div>
          </section>

          <section className="settings-card learning-card">
            <div className="settings-title"><span><Icon name="sparkles" /></span><div><h2>Aprendizaje local</h2><p>Ordena y adapta futuras listas usando solo tus acciones en este dispositivo.</p></div></div>
            <div className="learning-stats" aria-label="Resumen del aprendizaje local">
              <div><strong>{personalization.totalSignals}</strong><span>señales</span></div>
              <div><strong>{learnedItems}</strong><span>objetos aprendidos</span></div>
              <div><strong>{recurringPending}</strong><span>pendientes frecuentes</span></div>
            </div>
            <div className="learning-actions">
              <p>Las reglas esenciales nunca se eliminan. La IA local solo se ejecuta cuando pulsas su botón.</p>
              <button className="secondary-button" disabled={personalization.totalSignals === 0} onClick={onResetPersonalization} type="button">Borrar aprendizaje</button>
            </div>
          </section>

          <section className="settings-card data-control-card">
            <div className="settings-title"><span><Icon name="shield" /></span><div><h2>Control de tus datos</h2><p>Elimina toda la información creada o guardada por OPECONCA Campo.</p></div></div>
            <div className="data-control-content">
              <p>Se borrarán el borrador, la checklist, las rutinas, preferencias, el pronóstico resumido y el aprendizaje local. Los permisos del navegador se gestionan desde sus ajustes.</p>
              {!showClearConfirmation ? (
                <button className="danger-button" disabled={storageStatus === 'loading'} onClick={() => { setShowClearConfirmation(true); setClearMessage('') }} ref={clearDataTriggerRef} type="button">Borrar todos mis datos locales</button>
              ) : (
                <div aria-describedby="clear-data-description" aria-labelledby="clear-data-title" aria-modal="false" className="clear-data-confirmation" role="alertdialog">
                  <strong id="clear-data-title">¿Confirmas el borrado?</strong>
                  <p id="clear-data-description">Esta acción no se puede deshacer.</p>
                  <div>
                    <button autoFocus className="secondary-button" disabled={isClearingData} onClick={cancelClearLocalData} type="button">Cancelar</button>
                    <button className="danger-button" disabled={isClearingData} onClick={handleClearLocalData} type="button">{isClearingData ? 'Borrando…' : 'Sí, borrar datos'}</button>
                  </div>
                </div>
              )}
              {clearMessage && <p aria-live="polite" className="clear-data-message">{clearMessage}</p>}
            </div>
          </section>
        </div>

        <aside className="privacy-card">
          <span className="privacy-icon"><Icon name="shield" size={25} /></span>
          <span className="eyebrow">Permisos bajo control</span>
          <h2>Tú decides cuándo</h2>
          <p>OPECONCA Campo guarda rutinas, preferencias, la checklist actual y un resumen del último pronóstico. Nunca almacena coordenadas.</p>
          <ul>
            <li><span /> Pronóstico resumido, sin coordenadas</li>
            <li><span /> Permisos fuera de IndexedDB</li>
            <li><span /> Shell disponible sin conexión</li>
          </ul>
          <div className="phase-note">PWA offline · IndexedDB versión 1</div>
        </aside>
      </div>

      <div className="settings-footer">
        <span className="autosave-label"><Icon name="check" size={16} /> No necesitas pulsar guardar</span>
      </div>
    </div>
  )
}
