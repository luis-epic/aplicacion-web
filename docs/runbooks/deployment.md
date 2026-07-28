# Runbook de despliegue productivo

## Alcance y requisito de TLS

`infra/compose.production.yaml` es una base vendor-neutral para un único host. No termina TLS ni incluye certificados de prueba. Un edge externo (balanceador, ingress o reverse proxy) **debe** terminar TLS con un certificado válido, aplicar redirección HTTP→HTTPS y reenviar únicamente a los puertos publicados en `127.0.0.1`. No publique PostgreSQL ni conecte directamente las redes internas.

## Preparación

1. Instale Docker Engine con Compose v2 y PowerShell 7 para los procedimientos operativos.
2. Cree imágenes versionadas e inmutables para `API_IMAGE`, `API_MIGRATION_IMAGE`, `WEB_IMAGE` y `FIELD_IMAGE`; no use `latest` para despliegues controlados.
3. Cree cuatro archivos de secretos fuera del repositorio, legibles solo por el operador:
   - `POSTGRES_PASSWORD_FILE`: contraseña PostgreSQL.
   - `DATABASE_URL_FILE`: URL completa `postgresql://...@postgres:5432/...?...` con la misma contraseña.
   - `JWT_ACCESS_SECRET_FILE` y `JWT_REFRESH_SECRET_FILE`: valores aleatorios distintos de al menos 32 caracteres.
4. Cree un archivo de entorno no versionado. Todos estos valores son obligatorios:

```dotenv
POSTGRES_DB=opeconca
POSTGRES_USER=opeconca
POSTGRES_PASSWORD_FILE=/ruta/segura/postgres_password
DATABASE_URL_FILE=/ruta/segura/database_url
JWT_ACCESS_SECRET_FILE=/ruta/segura/jwt_access_secret
JWT_REFRESH_SECRET_FILE=/ruta/segura/jwt_refresh_secret
API_IMAGE=registry.example/opeconca-api:2026.07.27
API_MIGRATION_IMAGE=registry.example/opeconca-api-migrate:2026.07.27
WEB_IMAGE=registry.example/opeconca-web:2026.07.27
FIELD_IMAGE=registry.example/opeconca-field:2026.07.27
TRUST_PROXY_HOPS=1
JWT_ACCESS_TTL_SECONDS=900
JWT_REFRESH_TTL_DAYS=30
APP_URL=https://portal.example.com
FIELD_APP_URL=https://campo.example.com
NEXT_PUBLIC_API_URL=https://api.example.com/api/v1
API_BIND_PORT=4000
WEB_BIND_PORT=3000
FIELD_BIND_PORT=5173
```

`NEXT_PUBLIC_API_URL` se incorpora durante el build web; cambiarla requiere reconstruir esa imagen. Ajuste `TRUST_PROXY_HOPS` al número exacto de proxies confiables. Redis no forma parte del Compose productivo porque la aplicación no lo usa.

## Validación y despliegue

```powershell
docker compose --env-file C:\secure\production.env -f infra/compose.production.yaml config --quiet
docker compose --env-file C:\secure\production.env -f infra/compose.production.yaml build
docker compose --env-file C:\secure\production.env -f infra/compose.production.yaml up -d
```

`api-migrate` ejecuta migraciones antes de arrancar la API; no ejecuta seed ni crea credenciales administrativas. Revise su salida y el estado:

```powershell
docker compose --env-file C:\secure\production.env -f infra/compose.production.yaml ps
docker compose --env-file C:\secure\production.env -f infra/compose.production.yaml logs api-migrate api
```

Compruebe desde el host:

```powershell
Invoke-RestMethod http://127.0.0.1:4000/api/v1/health/live
Invoke-RestMethod http://127.0.0.1:4000/api/v1/health/ready
```

`live` solo confirma el proceso. `ready` devuelve 503 si `SELECT 1` no funciona en PostgreSQL. Configure el edge para retirar tráfico basándose en `ready`, pero reinicie procesos únicamente según `live`.

## Verificación posterior

Confirme TLS/certificado desde el exterior, login, lectura autorizada y escritura controlada; revise logs sin exponer secretos; confirme que PostgreSQL no tiene puerto host; y ejecute un backup según `backup-restore.md`. No continúe si la migración, readiness o los flujos críticos fallan.
