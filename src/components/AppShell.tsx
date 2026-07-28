import type { ReactNode } from 'react'
import type { IconName, PageId } from '../types/app'
import { Icon } from './Icon'
import { PwaControls } from './PwaControls'

interface AppShellProps {
  activePage: PageId
  children: ReactNode
  immersive?: boolean
  onNavigate: (page: PageId) => void
}

const navItems: Array<{ id: PageId; label: string; icon: IconName }> = [
  { id: 'home', label: 'Inicio', icon: 'home' },
  { id: 'checklist', label: 'Mi lista', icon: 'checklist' },
  { id: 'routines', label: 'Rutinas', icon: 'routines' },
  { id: 'settings', label: 'Ajustes', icon: 'settings' },
]

export function AppShell({ activePage, children, immersive = false, onNavigate }: AppShellProps) {
  return (
    <div className={immersive ? 'app-shell immersive-shell' : 'app-shell'}>
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>

      <aside className="sidebar">
        <button
          aria-label="Ir al inicio"
          className="brand brand-button"
          onClick={() => onNavigate('home')}
          type="button"
        >
          <span className="brand-mark"><Icon name="checklist" size={23} /></span>
          <span>
            <strong>OPECONCA</strong>
            <small>Operación de campo</small>
          </span>
        </button>

        <nav aria-label="Navegación principal" className="side-nav">
          {navItems.map((item) => (
            <button
              aria-current={activePage === item.id ? 'page' : undefined}
              className={activePage === item.id ? 'nav-item active' : 'nav-item'}
              key={item.id}
              onClick={() => onNavigate(item.id)}
              type="button"
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-note">
          <span className="status-dot" />
          <div>
            <strong>Lista para trabajar offline</strong>
            <p>Tus datos permanecen en este dispositivo.</p>
          </div>
        </div>
      </aside>

      <header className="mobile-header">
        <button
          aria-label="Ir al inicio"
          className="brand brand-button"
          onClick={() => onNavigate('home')}
          type="button"
        >
          <span className="brand-mark"><Icon name="checklist" size={20} /></span>
          <span className="mobile-brand-copy">
            <strong>OPECONCA</strong>
            <small>Campo</small>
          </span>
        </button>
        <span className="phase-pill">PWA</span>
      </header>

      <main id="main-content">{children}</main>
      <PwaControls />

      <nav aria-label="Navegación móvil" className="bottom-nav">
        {navItems.map((item) => (
          <button
            aria-current={activePage === item.id ? 'page' : undefined}
            className={activePage === item.id ? 'active' : ''}
            key={item.id}
            onClick={() => onNavigate(item.id)}
            type="button"
          >
            <Icon name={item.icon} size={19} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
