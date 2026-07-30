# Acta de validación de staging

## Identificación

- Release/SHA:
- URL CI y artefacto de release:
- Ventana UTC:
- Responsable técnico:
- Snapshot de datos (identificador anonimizado):
- Digests API / migración / web / field:
- Digest PostgreSQL:

## Ejecución

| Control | Resultado (Go/No-Go) | Evidencia/URL | Responsable | Hora UTC |
| --- | --- | --- | --- | --- |
| `SHA256SUMS` y manifiesto verificados |  |  |  |  |
| Digests desplegados coinciden; no hubo build |  |  |  |  |
| Migraciones y catálogo RBAC |  |  |  |  |
| Readiness/live y métricas privadas |  |  |  |  |
| TLS, HSTS y `/api/v1` same-origin |  |  |  |  |
| Login, refresh, logout y bootstrap retirado |  |  |  |  |
| Revocación de rol bloquea y purga PWA |  |  |  |  |
| Publicación con portada corporativa/fallback |  |  |  |  |
| Tareas y reportes online |  |  |  |  |
| Operación offline→online sin duplicados |  |  |  |  |
| Cache Storage no contiene `/api/` |  |  |  |  |
| Logs/métricas/alertas externos |  |  |  |  |
| Backup/checksum off-host |  |  |  |  |
| Rollback a digests previos ensayado |  |  |  |  |

## Incidencias y conclusión

- Incidencias bloqueantes:
- Incidencias aceptadas (propietario/vencimiento):
- Resultado staging: **PENDIENTE**
- Firma técnica / fecha UTC:
