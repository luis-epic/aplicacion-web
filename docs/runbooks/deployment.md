# Runbook de despliegue productivo

## Alcance y requisito de TLS

`infra/compose.production.yaml` es una base vendor-neutral para un único host. No termina TLS ni incluye certificados de prueba. Un edge externo (balanceador, ingress o reverse proxy) **debe** terminar TLS con un certificado válido, aplicar redirección HTTP→HTTPS y reenviar únicamente a los puertos publicados en `127.0.0.1`. No publique PostgreSQL ni conecte directamente las redes internas.

## Preparación

1. Instale Docker Engine con Compose v2 y PowerShell 7 para los procedimientos operativos.
2. Descargue y extraiga el artefacto `opeconca-release-<SHA>` generado por CI. Desde su directorio raíz ejecute `sha256sum -c release/SHA256SUMS`; las rutas son relativas al artefacto descargado y todas deben indicar `OK`. Confirme que `release/release-manifest.json` referencia el mismo commit aprobado y copie `release/images.env` al archivo de entorno del destino. No edite referencias ni sustituya digests por tags.
3. Fije también `POSTGRES_IMAGE` como referencia `postgres@sha256:...`, aprobada y escaneada por plataforma.
4. Cree seis archivos de secretos fuera del repositorio, legibles solo por el operador:
   - `POSTGRES_PASSWORD_FILE`: contraseña PostgreSQL.
   - `DATABASE_URL_FILE`: URL completa `postgresql://...@postgres:5432/...?...` con la misma contraseña.
   - `JWT_ACCESS_SECRET_FILE` y `JWT_REFRESH_SECRET_FILE`: valores aleatorios distintos de al menos 32 caracteres.
   - `METRICS_TOKEN_FILE`: token aleatorio dedicado de al menos 32 caracteres; no reutilice un JWT ni una contraseña.
   - `ADMIN_PASSWORD_FILE`: sólo durante el bootstrap inicial; elimínelo del host después de validar acceso.
5. Cree un archivo de entorno no versionado. Todos estos valores son obligatorios salvo los de bootstrap, que se usan una sola vez:

```dotenv
POSTGRES_DB=opeconca
POSTGRES_USER=opeconca
POSTGRES_IMAGE=postgres:17.5-alpine3.22@sha256:<digest-aprobado>
POSTGRES_PASSWORD_FILE=/ruta/segura/postgres_password
DATABASE_URL_FILE=/ruta/segura/database_url
JWT_ACCESS_SECRET_FILE=/ruta/segura/jwt_access_secret
JWT_REFRESH_SECRET_FILE=/ruta/segura/jwt_refresh_secret
METRICS_TOKEN_FILE=/ruta/segura/metrics_token
API_IMAGE=ghcr.io/organizacion/repositorio/api@sha256:<digest>
API_MIGRATION_IMAGE=ghcr.io/organizacion/repositorio/api-migration@sha256:<digest>
WEB_IMAGE=ghcr.io/organizacion/repositorio/web@sha256:<digest>
FIELD_IMAGE=ghcr.io/organizacion/repositorio/field@sha256:<digest>
PUBLICATION_MEDIA_PATH=/srv/opeconca/media/publications
SERVICE_VERSION=<commit-sha-completo>
LOG_LEVEL=info
TRUST_PROXY_HOPS=1
JWT_ACCESS_TTL_SECONDS=900
JWT_REFRESH_TTL_DAYS=30
APP_URL=https://portal.example.com
FIELD_APP_URL=https://campo.example.com
API_BIND_PORT=4000
WEB_BIND_PORT=3000
FIELD_BIND_PORT=5173
```

El portal consume `/api/v1` en su mismo origen mediante su proxy interno al servicio API; el edge también puede enrutar esa ruta directamente, pero no debe cambiar su semántica. No se recompila la imagen para cambiar de entorno. `PUBLICATION_MEDIA_PATH` debe ser un directorio corporativo administrado y montado read-only únicamente en la API; portal y PWA recuperan cada portada mediante `/api/v1/publications/<id>/cover`, que aplica permisos y audiencia. Publique archivos de forma atómica, conserve exactamente la ruta registrada bajo `/media/publications/` y nunca exponga ese directorio desde el edge, portal o PWA. Ajuste `TRUST_PROXY_HOPS` al número exacto de proxies confiables. Redis no forma parte del Compose productivo porque la aplicación no lo usa.

## Validación, checkpoint y despliegue

Valide configuración, política de digests y acceso al registro sin construir nada en el host:

```powershell
corepack pnpm compose:validate
docker compose --env-file C:\secure\production.env -f infra/compose.production.yaml config --quiet
docker compose --env-file C:\secure\production.env -f infra/compose.production.yaml pull
```

Si Compose muestra una sección `build`, una imagen sin `@sha256:` o el pull resuelve un artefacto distinto del manifiesto, aborte. El host productivo no necesita el código fuente ni toolchain de compilación.

**Antes de ejecutar `up` en toda actualización**, cree el checkpoint pre-migración y copie `.dump` y `.sha256` al almacenamiento cifrado off-host:

```powershell
pwsh -NoProfile -File scripts/backup-postgres.ps1 `
  -OutputDirectory D:\opeconca-backups `
  -EnvironmentFile C:\secure\production.env `
  -RetentionDays 30 `
  -MinimumBackups 7
```

Verifique checksum y copia externa. Si backup, verificación o copia fallan, aborte el despliegue. Sólo el primer bootstrap de una base vacía carece de checkpoint previo; regístrelo explícitamente. Después:

```powershell
docker compose --env-file C:\secure\production.env -f infra/compose.production.yaml up -d
```

`api-migrate` ejecuta migraciones y aprovisiona el catálogo RBAC antes de arrancar la API; nunca ejecuta el seed. En una base nueva, cree el primer administrador **una sola vez** después de una migración verde:

```powershell
$env:ADMIN_EMAIL='administrador@empresa.example'
$env:ADMIN_NAME='Administrador inicial'
$env:ADMIN_PASSWORD_FILE='C:\secure\admin_password'
$env:ADMIN_BOOTSTRAP_CONFIRM='CREATE_INITIAL_ADMIN'
docker compose --env-file C:\secure\production.env `
  -f infra/compose.production.yaml -f infra/compose.bootstrap.yaml `
  --profile bootstrap run --rm api-bootstrap
Remove-Item Env:ADMIN_EMAIL,Env:ADMIN_NAME,Env:ADMIN_PASSWORD_FILE,Env:ADMIN_BOOTSTRAP_CONFIRM
```

El comando no cambia la contraseña de un usuario existente, falla si está inactivo y es idempotente respecto al rol ADMIN. Valide login y auditoría; luego elimine el archivo temporal y retire acceso al secreto. No vuelva a ejecutar bootstrap como mecanismo de recuperación de contraseña.

Revise la salida y el estado:

```powershell
docker compose --env-file C:\secure\production.env -f infra/compose.production.yaml ps
docker compose --env-file C:\secure\production.env -f infra/compose.production.yaml logs api-migrate api
```

Compruebe desde el host:

```powershell
Invoke-RestMethod http://127.0.0.1:4000/api/v1/health/live
Invoke-RestMethod http://127.0.0.1:4000/api/v1/health/ready
$metricsToken = (Get-Content C:\secure\metrics_token -Raw).Trim()
Invoke-WebRequest http://127.0.0.1:4000/api/v1/metrics -Headers @{ Authorization = "Bearer $metricsToken" }
Remove-Variable metricsToken
```

`live` solo confirma el proceso. `ready` devuelve 503 si `SELECT 1` no funciona en PostgreSQL. Configure el edge para retirar tráfico basándose en `ready`, pero reinicie procesos únicamente según `live`. No publique `/api/v1/metrics` en el edge público: el scraper debe llegar por loopback o una red privada y usar el token dedicado. Los logs salen como JSON por `stdout`/`stderr`, incluyen versión, request ID y trace ID, y están rotados por Docker (5 archivos de 10 MB). Consulte `incident-observability.md` para métricas y alertas.

## Ensayo obligatorio en staging

Staging debe usar una restauración anonimizada/representativa, dominios y secretos propios, pero exactamente los digests del manifiesto candidato. Complete `docs/templates/staging-validation.md`: registre migraciones antes/después; readiness; login/logout y revocación de permisos; creación/publicación corporativa; tareas; reporte online; operación offline→online; confirmación de que `/api/` no entra en Cache Storage; telemetría; backup y rollback de aplicación. Mantenga al menos una sesión offline durante la revocación de permisos y confirme que al recuperar red la PWA bloquea el módulo y elimina los datos del propietario.

No promueva si staging recompiló una imagen, usa una base vacía en lugar del snapshot acordado, omite el flujo offline o no puede volver a los digests anteriores sin tocar datos.

## Versionado, promoción y rollback

1. Construya las cuatro imágenes una sola vez desde el commit aprobado. Etiquete con el SHA completo o corto inequívoco; no reconstruya entre entornos.
2. Escanee cada imagen, genere SBOM y publique en el registro. Obtenga su digest OCI y registre `repositorio@sha256:...` en la evidencia del release.
3. Despliegue esos mismos digests en staging, complete `docs/release-checklist.md` y realice el piloto. Promover significa cambiar referencias de staging a producción, nunca volver a construir.
4. Antes de migrar producción, confirme que la migración es compatible hacia atrás (expand/contract) y cree el checkpoint verificado.
5. Para rollback de aplicación, restaure los digests anteriores. No revierta una migración destructiva automáticamente; siga el plan de compatibilidad o restaure el checkpoint únicamente bajo decisión de incidente.

La versión de servicio (`SERVICE_VERSION`) debe identificar el mismo commit que las imágenes. Conserve manifiestos, digests, SBOM, resultados CI, aprobación y checkpoint durante la retención acordada.

## Verificación posterior

Confirme TLS/certificado desde el exterior, login, lectura autorizada y escritura controlada; revise logs sin exponer secretos; confirme que PostgreSQL no tiene puerto host; y ejecute un backup según `backup-restore.md`. No continúe si la migración, readiness o los flujos críticos fallan.
