# OPECONCA

Plataforma operativa para equipos administrativos y de campo. Reúne un portal web, una API y una PWA orientada a capturar y sincronizar trabajo de campo, con permisos auditables y funcionamiento offline controlado.

> **Estado del proyecto:** el entorno local, la validación de releases y los runbooks están preparados. No hay producción pública, piloto real ni integración AWS declarados como activos. Consulte [Estado de producción](#estado-de-producción) antes de promover un entorno.

## Capacidades

- Gestión de usuarios, roles, clientes, proyectos y miembros.
- Reportes de campo con flujo borrador → enviado → aprobado/rechazado.
- Actualidad corporativa, Centro de trabajo y publicaciones con audiencia autorizada.
- Autorización RBAC aplicada en servidor, auditoría e idempotencia para operaciones sensibles.
- PWA de campo con IndexedDB, outbox, reintentos y sincronización offline→online.
- Validación automatizada: pruebas unitarias, integración, E2E, accesibilidad, offline, carga, tipos, lint, builds, auditoría de dependencias y Compose.
- Imágenes inmutables por digest, SBOM CycloneDX, escaneo de secretos e imágenes en CI.

## Arquitectura

```text
┌─────────────────────────────┐       ┌──────────────────────────────┐
│ Portal administrativo        │       │ OPECONCA Campo                │
│ Next.js                      │       │ React + Vite PWA              │
└──────────────┬──────────────┘       └──────────────┬───────────────┘
               │ HTTPS / same-origin API                            │
               └──────────────────────┬─────────────────────────────┘
                                      │
                        ┌─────────────▼─────────────┐
                        │ API NestJS                 │
                        │ RBAC · auditoría · métricas│
                        └─────────────┬─────────────┘
                                      │
                        ┌─────────────▼─────────────┐
                        │ PostgreSQL + Prisma        │
                        └───────────────────────────┘
```

La PWA conserva datos operativos en IndexedDB y usa una outbox idempotente; PostgreSQL es la fuente definitiva. La aplicación no expone la base de datos ni las redes internas en la topología de producción de referencia.

## Estructura del repositorio

```text
apps/
  api/       API NestJS, Prisma y contratos de negocio
  web/       Portal administrativo Next.js
  field/     PWA React/Vite para trabajo de campo
packages/    Paquetes compartidos del monorepo
infra/       Compose MVP, pruebas, bootstrap y producción de referencia
scripts/     Validación, pruebas, manifiestos y operaciones PostgreSQL
docs/        Plan de producción, checklist, plantillas y runbooks
```

## Requisitos

- Node.js **24** o superior; CI usa `24.18.0`.
- Corepack y pnpm `11.17.0`.
- Docker Engine con Compose v2 para el MVP, pruebas de sistema y validación de releases.
- PowerShell 7 para los scripts y runbooks operativos en Windows.

## Inicio rápido local

Desde la raíz del repositorio:

```powershell
corepack enable
corepack prepare pnpm@11.17.0 --activate
corepack pnpm install --frozen-lockfile
Copy-Item .env.example .env
```

Edite `.env` exclusivamente para desarrollo local. Reemplace los valores `replace-with-*`; los secretos JWT deben ser distintos y tener al menos 32 caracteres. Nunca suba `.env`, credenciales, dumps ni tokens al repositorio.

Para levantar el MVP completo:

```powershell
corepack pnpm mvp:setup
```

Servicios locales predeterminados:

| Servicio | URL |
| --- | --- |
| Portal | `http://localhost:3000` |
| PWA de campo | `http://localhost:5173` |
| API | `http://localhost:4000/api/v1` |

Comandos operativos del MVP:

```powershell
corepack pnpm mvp:status
corepack pnpm mvp:down
```

> El Compose MVP es sólo para desarrollo local. No debe utilizarse como despliegue de producción.

## Desarrollo

Para iniciar los productos en modo desarrollo, con la configuración local ya preparada:

```powershell
corepack pnpm dev:all       # PWA + API + portal
corepack pnpm dev:platform  # API + portal
corepack pnpm dev           # Sólo PWA
```

La plantilla de variables está en [`.env.example`](.env.example). Incluye nombres de configuración, no secretos operativos reales.

## Calidad y pruebas

Comandos habituales:

```powershell
corepack pnpm test:unit
corepack pnpm test:coverage
corepack pnpm test:integration
corepack pnpm test:e2e
corepack pnpm test:a11y
corepack pnpm test:offline
corepack pnpm test:system
corepack pnpm typecheck:all
corepack pnpm lint:all
corepack pnpm build:all
corepack pnpm audit --prod
corepack pnpm compose:validate
```

Las pruebas E2E usan Playwright. Instale Chromium una vez antes de ejecutarlas:

```powershell
corepack pnpm exec playwright install chromium
```

La validación local integral es:

```powershell
corepack pnpm release:validate
```

Este comando ejecuta cobertura, pruebas de sistema, tipos, lint, build, auditoría, validación Compose y `git diff --check`; requiere Docker y reconstruye imágenes de prueba. En CI también se ejecutan Gitleaks, Trivy, SBOM CycloneDX y evidencia de promoción para el SHA candidato.

## Seguridad y datos

- Los permisos se comprueban en la API; el cliente no sustituye la autorización del servidor.
- La PWA evita almacenar respuestas `/api/` en Cache Storage y purga datos privados cuando se revoca el acceso al reconectar.
- Los logs se estructuran con identificadores de correlación y no deben incluir cuerpos de petición, cookies, tokens ni PII innecesaria.
- La configuración productiva usa secretos por archivo fuera del repositorio, imágenes OCI por digest, redes internas y PostgreSQL sin puerto de host.
- La publicación de archivos corporativos se realiza bajo control de permisos; no se debe exponer el directorio de medios directamente desde el edge.

Consulte [docs/runbooks/incident-observability.md](docs/runbooks/incident-observability.md) y [docs/runbooks/secret-rotation.md](docs/runbooks/secret-rotation.md) para la respuesta operativa.

## Backups y recuperación

Los backups PostgreSQL se generan con checksum SHA-256. El simulacro local aislado es repetible mediante:

```powershell
pwsh -NoProfile -File scripts/restore-drill-postgres.ps1 `
  -BackupPath D:\opeconca-backups\opeconca-postgres-YYYYMMDDTHHMMSSZ.dump
```

El script restaura en PostgreSQL temporal sin red ni puertos publicados, valida el catálogo, migraciones y esquema, y elimina sus recursos temporales al finalizar. Esta validación local no sustituye una restauración desde una copia cifrada off-host, PITR ni una prueba completa de aplicación.

Detalles: [runbook de backup y restauración](docs/runbooks/backup-restore.md) y [acta de simulacro](docs/templates/restore-drill.md).

## Operación y despliegue

`infra/compose.production.yaml` es una base vendor-neutral para un único host. Un despliegue real requiere imágenes publicadas por digest, TLS terminado en un edge externo, secretos gestionados fuera del repositorio y respaldo previo a cualquier migración.

Documentación principal:

| Tema | Documento |
| --- | --- |
| Plan por fases | [docs/production-readiness-plan.md](docs/production-readiness-plan.md) |
| Puertas de release | [docs/release-checklist.md](docs/release-checklist.md) |
| Despliegue y rollback | [docs/runbooks/deployment.md](docs/runbooks/deployment.md) |
| Backup y recuperación | [docs/runbooks/backup-restore.md](docs/runbooks/backup-restore.md) |
| Incidentes y observabilidad | [docs/runbooks/incident-observability.md](docs/runbooks/incident-observability.md) |
| TLS y edge | [docs/runbooks/edge-tls.md](docs/runbooks/edge-tls.md) |
| Rotación de secretos | [docs/runbooks/secret-rotation.md](docs/runbooks/secret-rotation.md) |
| Validación de staging | [docs/templates/staging-validation.md](docs/templates/staging-validation.md) |
| Piloto de dispositivos | [docs/templates/device-pilot.md](docs/templates/device-pilot.md) |
| Decisión Go/No-Go | [docs/templates/go-no-go.md](docs/templates/go-no-go.md) |

## Estado de producción

El repositorio incluye controles técnicos locales y CI, pero la producción pública se mantiene en **No-Go** hasta contar con evidencia verificable de:

1. Piloto controlado real, métricas observadas y decisión comercial documentada.
2. Dominio, DNS, TLS público y edge/ingress externos.
3. Secret manager, rotación de secretos y observabilidad/alertas externas.
4. Backups cifrados off-host, restauración desde esa copia y RPO/RTO aprobados; PITR/WAL cuando corresponda.
5. Validación formal mediante [checklist de release](docs/release-checklist.md) y acta [Go/No-Go](docs/templates/go-no-go.md).

AWS se evaluará sólo después de cerrar estas decisiones y controles; no es un requisito para ejecutar el entorno local o un piloto controlado.

## Licencia

No se ha definido una licencia en este repositorio. Antes de redistribuir o reutilizar el código, consulte al propietario del proyecto.
