# OPECONCA

Plataforma operativa formada por API NestJS, portal administrativo Next.js y PWA React/Vite para trabajo de campo. Incluye Actualidad corporativa, Centro de trabajo, clientes, proyectos, reportes, permisos auditables y operación offline con IndexedDB/outbox.

## Requisitos

- Node.js 24 o superior (CI usa `24.18.0`).
- Corepack y pnpm `11.17.0`.
- Docker Engine con Compose v2 para integración, E2E y entorno MVP.
- PowerShell 7 para los runbooks operativos en Windows.

## Inicio local

```powershell
corepack enable
corepack prepare pnpm@11.17.0 --activate
corepack pnpm install --frozen-lockfile
Copy-Item .env.example .env
```

Reemplace todos los valores `replace-with-*` de `.env` por valores locales; los dos secretos JWT deben ser distintos y tener al menos 32 caracteres. Para levantar el MVP completo:

```powershell
corepack pnpm mvp:setup
```

Servicios locales: portal `http://localhost:3000`, PWA `http://localhost:5173` y API `http://localhost:4000/api/v1`. No use el Compose MVP en producción.

## Calidad y pruebas

```powershell
corepack pnpm test:unit
corepack pnpm test:coverage
corepack pnpm typecheck:all
corepack pnpm lint:all
corepack pnpm build:all
corepack pnpm audit --prod
```

Las pruebas con Docker crean `opeconca-test`, usan puertos aislados (`4400`, `3300`, `5273`), generan secretos efímeros y eliminan contenedores/volúmenes al terminar:

```powershell
corepack pnpm test:integration
corepack pnpm test:e2e
corepack pnpm test:a11y
corepack pnpm test:offline
corepack pnpm test:system
```

Instale Chromium una vez antes de Playwright: `corepack pnpm exec playwright install chromium`. La validación local integral de código, sistema, Compose y whitespace es `corepack pnpm release:validate`; reconstruye imágenes y requiere Docker disponible. Gitleaks, Trivy y la publicación de SBOM son puertas adicionales del CI sobre el SHA candidato.

## Cobertura de release

- Vitest: validación productiva, métricas RED, redacción de logs e IndexedDB/outbox por usuario.
- Integración: health/readiness, 401/403/400/404/409 e idempotencia exactamente una vez.
- Playwright + axe: login/navegación del portal, accesibilidad antes/después de autenticación y PWA offline.
- Carga smoke: 60 solicitudes concurrentes acotadas, error ≤1 % y p95 ≤750 ms por defecto.
- CI: tipos, lint, builds, cobertura, audit, Gitleaks, Compose efímero, Trivy y SBOM CycloneDX.

## Producción

El despliegue parte de `infra/compose.production.yaml`; requiere TLS externo, secretos por archivo, imágenes inmutables y PostgreSQL protegido. Consulte:

- `docs/production-readiness-plan.md`
- `docs/release-checklist.md`
- `docs/runbooks/deployment.md`
- `docs/runbooks/backup-restore.md`
- `docs/runbooks/incident-observability.md`
- `docs/runbooks/edge-tls.md`
- `docs/runbooks/secret-rotation.md`

No se versionan `.env`, credenciales, dumps, reportes de pruebas ni artefactos SBOM locales.
