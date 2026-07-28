# Runbook de rollback

## Criterios

Inicie rollback si fallan la migración, readiness, autenticación o un flujo crítico; si aumenta sostenidamente la tasa de errores; o si hay corrupción/inconsistencia. Retire tráfico en el edge antes de cambios destructivos y registre versiones, hora y responsable.

## Aplicación sin cambio incompatible de esquema

1. Mantenga el volumen PostgreSQL y los secretos sin cambios.
2. Cambie `API_IMAGE`, `API_MIGRATION_IMAGE`, `WEB_IMAGE` y `FIELD_IMAGE` en el archivo de entorno a los tags/digests previamente aprobados.
3. Valide y despliegue:

```powershell
docker compose --env-file C:\secure\production.env -f infra/compose.production.yaml config --quiet
docker compose --env-file C:\secure\production.env -f infra/compose.production.yaml up -d --no-build
```

4. Compruebe `api-migrate`, `/api/v1/health/live`, `/api/v1/health/ready` y los flujos críticos. Reanude tráfico gradualmente.

## Cambio de esquema incompatible

Las migraciones Prisma desplegadas son forward-only; no intente improvisar SQL inverso en producción. Si la versión anterior no puede operar con el esquema nuevo:

1. Mantenga el tráfico retirado y detenga `api`, `web` y `field`.
2. Preserve logs y tome un backup del estado fallido para análisis.
3. Restaure el backup previo al despliegue siguiendo `backup-restore.md`.
4. Fije las imágenes anteriores y arránquelas con `--no-build`.
5. Valide readiness y consistencia funcional antes de reabrir el edge.

Toda pérdida entre el backup restaurado y el incidente debe evaluarse contra el RPO y, si existe, recuperarse mediante PITR/WAL. No elimine volúmenes ni ejecute `down -v` durante un rollback.

## Cierre

Documente causa, impacto y datos recuperados/perdidos; conserve artefactos y logs; verifique un backup posterior; y no reintente el release hasta corregir y ensayar migración y rollback en un entorno aislado.
