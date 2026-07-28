# Runbook de backup y restauración PostgreSQL

## Política mínima

Ejecute backups antes de cada despliegue/migración y según el RPO acordado. Copie los `.dump` y `.sha256` fuera del host, cifrados y con retención definida. Un backup no está validado hasta restaurarlo periódicamente en un entorno aislado. Para RPO menor que el intervalo de backups, configure archivado WAL/PITR fuera de este Compose.

Los scripts usan las credenciales ya montadas dentro de `postgres`; no leen ni imprimen contraseñas. Ambos exigen confirmación textual y rutas explícitas.

## Backup

```powershell
pwsh -NoProfile -File scripts/backup-postgres.ps1 `
  -OutputDirectory D:\opeconca-backups `
  -EnvironmentFile C:\secure\production.env
```

Escriba `BACKUP` cuando se solicite. El resultado es un dump en formato custom y su checksum SHA-256. Verifique que ambos archivos se copiaron al almacenamiento externo y registre fecha, versión de aplicación y responsable.

## Restauración

1. Declare ventana de mantenimiento y retire tráfico en el edge externo.
2. Cree un backup previo de la base actual.
3. Verifique que la versión destino de PostgreSQL es compatible y que dispone del `.sha256` junto al dump.
4. Mantenga `postgres` activo y detenga procesos que escriben:

```powershell
docker compose --env-file C:\secure\production.env -f infra/compose.production.yaml stop api web field
pwsh -NoProfile -File scripts/restore-postgres.ps1 `
  -BackupPath D:\opeconca-backups\opeconca-postgres-YYYYMMDDTHHMMSSZ.dump `
  -EnvironmentFile C:\secure\production.env
```

Escriba `RESTORE` cuando se solicite. El script valida el checksum y el catálogo, y restaura en una transacción con limpieza de objetos existentes.

5. Arranque la versión de aplicación compatible:

```powershell
docker compose --env-file C:\secure\production.env -f infra/compose.production.yaml up -d api web field
```

6. Valide `/api/v1/health/ready`, autenticación y flujos críticos antes de reanudar tráfico. Conserve el backup previo hasta cerrar el incidente.

## Fallos

No repita una restauración a ciegas. Mantenga el tráfico retirado, guarde logs, compruebe espacio, compatibilidad de versión y checksum. Si falló dentro de `--single-transaction`, PostgreSQL revierte los cambios de esa ejecución; valide igualmente el estado antes de decidir el siguiente intento.
