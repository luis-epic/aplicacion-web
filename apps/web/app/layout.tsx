import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

// Next.js requiere exportar los metadatos desde el mismo archivo del layout.
// oxlint-disable-next-line react/only-export-components
export const metadata: Metadata = {
  title: 'OPECONCA · Gestión operativa',
  description: 'Portal administrativo para clientes, proyectos y operación de campo.',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
