# Runbook de backup y restauración PostgreSQL

## Objetivos y política

Hasta que el propietario apruebe otros valores, la línea base es **RPO 24 horas** y **RTO 4 horas**: backup diario, antes de toda migración y restauración operativa dentro de cuatro horas. Conserve al menos 7 copias diarias, 4 semanales y 12 mensuales. La retención local automatizada es de 30 días; las copias semanales/mensuales se administran en almacenamiento externo.

Cada `.dump` y `.sha256` debe copiarse automáticamente fuera del host mediante un canal cifrado hacia almacenamiento con cifrado en reposo, versionado/inmutabilidad y una cuenta distinta a la del host. El script no implementa un proveedor de almacenamiento ni guarda claves de cifrado. Si se aprueba un RPO inferior a 24 horas, habilite archivado continuo WAL/PITR en el servicio PostgreSQL elegido; los dumps diarios por sí solos no satisfacen ese objetivo.

Un backup no se considera recuperable hasta restaurarlo. Ejecute un simulacro trimestral en PostgreSQL aislado, mida tiempo total, valide conteos y flujos críticos, y registre fecha, backup, checksum, duración, responsable y resultado.

## Backup manual

```powershell
pwsh -NoProfile -File scripts/backup-postgres.ps1 `
  -OutputDirectory D:\opeconca-backups `
  -EnvironmentFile C:\secure\production.env `
  -RetentionDays 30 `
  -MinimumBackups 7
```

Escriba `BACKUP` cuando se solicite. El resultado es un dump custom comprimido y su SHA-256. La retención vuelve a calcular todos los checksums, sólo cuenta pares restaurables, nunca elimina los `MinimumBackups` válidos más recientes y aborta sin podar si encuentra un dump huérfano o alterado; el operador debe ponerlo en cuarentena e investigar. Confirme que ambos archivos llegaron al almacenamiento externo antes de considerar exitosa la ejecución.

## Programación

Programe una tarea diaria con una cuenta de servicio de privilegios mínimos. El modo no interactivo existe sólo para el scheduler:

```powershell
pwsh -NoProfile -File C:\opeconca\scripts\backup-postgres.ps1 `
  -OutputDirectory D:\opeconca-backups `
  -EnvironmentFile C:\secure\production.env `
  -NonInteractive `
  -RetentionDays 30 `
  -MinimumBackups 7
```

La tarea debe fallar ante código de salida distinto de cero, enviar la copia off-host y publicar dos señales al monitor: resultado de la última ejecución y antigüedad del último `.dump` con checksum. Alerte inmediatamente por fallo y cuando la antigüedad supere 26 horas. No use `-NonInteractive` en restauraciones.

## Restauración productiva

1. Declare ventana de mantenimiento, retire tráfico en el edge y registre inicio/responsable.
2. Cree un backup previo de la base actual y conserve logs.
3. Verifique compatibilidad de PostgreSQL y que el `.sha256` esté junto al dump.
4. Detenga procesos escritores y restaure:

```powershell
docker compose --env-file C:\secure\production.env -f infra/compose.production.yaml stop api web field
pwsh -NoProfile -File scripts/restore-postgres.ps1 `
  -BackupPath D:\opeconca-backups\opeconca-postgres-YYYYMMDDTHHMMSSZ.dump `
  -EnvironmentFile C:\secure\production.env
```

Escriba `RESTORE`. El script valida checksum y catálogo; después limpia y restaura objetos en una única transacción.

5. Arranque la versión compatible y valide antes de abrir tráfico:

```powershell
docker compose --env-file C:\secure\production.env -f infra/compose.production.yaml up -d api web field
Invoke-RestMethod http://127.0.0.1:4000/api/v1/health/ready
```

Compruebe autenticación, proyectos, publicaciones, tareas y reportes; compare conteos esperados y registre el RTO observado. Conserve el backup previo hasta cerrar el incidente.

## Simulacro aislado

Nunca ensaye sobre la base activa. El script `scripts/restore-drill-postgres.ps1` crea PostgreSQL temporal sin red ni puertos publicados, valida checksum y catálogo, restaura transaccionalmente, comprueba readiness, tablas y migraciones, y elimina el contenedor y el volumen incluso ante error:

```powershell
pwsh -NoProfile -File scripts/restore-drill-postgres.ps1 `
  -BackupPath D:\opeconca-backups\opeconca-postgres-YYYYMMDDTHHMMSSZ.dump
```

El script no se conecta al Compose activo, no inicia API/web/PWA y no sustituye una restauración desde la copia externa. Inicie el cronómetro antes de obtener/verificar el backup y deténgalo sólo después de validar readiness y los flujos que formen parte del objetivo. Calcule el RPO como diferencia entre la marca de tiempo del último dato esperado y el corte del incidente simulado; la marca de tiempo del nombre del dump sólo es una cota local. Calcule el RTO como duración total hasta declarar el servicio recuperable. Ambos deben quedar dentro de 24 h/4 h o de los objetivos formalmente aprobados.

Complete `docs/templates/restore-drill.md` con identificador del dump, SHA-256, ámbito local/externo, ubicación off-host, versión PostgreSQL, conteos antes/después, migraciones, pruebas funcionales, RPO/RTO observados y firmas. Destruya los datos temporales de forma segura al finalizar. El acta del simulacro es evidencia del RPO/RTO; un comando exitoso sin validación de datos no lo es.

## Fallos

No repita una restauración a ciegas. Mantenga tráfico retirado, preserve logs y compruebe espacio, versión y checksum. `--single-transaction` revierte una ejecución fallida, pero valide igualmente el estado antes del siguiente intento. Escale según `incident-observability.md` si el RTO está en riesgo.
## Evidencia de simulacro de implementación

El 2026-07-28 se generó un dump real del PostgreSQL MVP con el script, se validaron checksum y catálogo, y se restauró con PostgreSQL 17.5 en un contenedor y base aislados. La fuente y la restauración coincidieron en 21 tablas, 5 migraciones y conteos de `User`, `Project`, `FieldReport`, `Publication` y `WorkTask` (`[1,0,0,0,0]`). El contenedor y ambos archivos temporales no cifrados se eliminaron después. Esta evidencia valida la mecánica; la copia cifrada off-host y el simulacro trimestral con datos sintéticos de staging siguen siendo controles operativos obligatorios del proveedor elegido.