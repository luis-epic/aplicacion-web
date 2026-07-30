# Acta de simulacro de restauración

## Regla de evidencia

Use un estado por control:

- **VALIDADO_LOCAL**: comprobado en PostgreSQL aislado; no acredita la copia off-host, PITR ni recuperación de producción.
- **VALIDADO_EXTERNO**: comprobado restaurando la copia cifrada externa en el entorno acordado, con evidencia verificable.
- **PENDIENTE_EXTERNO**: depende de proveedor, almacenamiento o plataforma aún no aprobados.
- **NO_EJECUTADO**: todavía no se realizó.

No marque RPO/RTO como aprobados sin un corte de incidente definido, objetivo firmado y validación de los flujos aplicables. Esta acta no autoriza producción pública.

## Identificación

- Fecha/hora UTC y responsable:
- Estado general: **NO_EJECUTADO**
- Entorno aislado/externo y alcance de red:
- Backup/dump:
- SHA-256 verificado:
- Ubicación cifrada off-host y resultado de acceso:
- PostgreSQL origen/destino:
- Objetivos aprobados: RPO ___ / RTO ___
- Corte de incidente simulado y último dato esperado/restaurado:

## Cronología y medición

- Inicio obtención/verificación:
- Inicio restauración:
- Fin restauración técnica:
- Fin validación funcional:
- RPO observado o cota/local y limitación:
- RTO observado:

## Integridad y recuperación

| Verificación | Ámbito | Estado | Antes/esperado | Después | Evidencia |
| --- | --- | --- | ---: | ---: | --- |
| `pg_restore --list` y checksum | Local/externo |  |  |  |  |
| Readiness y versión PostgreSQL compatible | Local/externo |  |  |  |  |
| Migraciones Prisma | Local/externo |  |  |  |  |
| Usuarios/roles/permisos | Local/externo |  |  |  |  |
| Proyectos | Local/externo |  |  |  |  |
| Reportes | Local/externo |  |  |  |  |
| Publicaciones | Local/externo |  |  |  |  |
| Tareas | Local/externo |  |  |  |  |
| Login, publicación, tarea y reporte | Entorno de aplicación |  |  |  |  |
| Copia cifrada off-host restaurada | Externo |  |  |  |  |
| PITR/WAL dentro del RPO aprobado | Externo |  |  |  |  |
| Datos temporales destruidos y evidencia preservada | Local/externo |  |  |  |  |

## Resultado y límites

- Resultado: **PENDIENTE**
- Incidencias/acciones con responsable y fecha:
- Controles externos pendientes y fecha objetivo:
- Firma técnica / fecha UTC:
- Firma del propietario / fecha UTC:
