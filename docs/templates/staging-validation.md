# Acta de validación de staging

## Regla de alcance

Use un estado por control:

- **VALIDADO_LOCAL**: comprobado en Docker aislado; no cierra una puerta externa de producción.
- **VALIDADO_EXTERNO**: comprobado desde el entorno/servicio externo acordado y con evidencia verificable.
- **PENDIENTE_EXTERNO**: depende de dominio, proveedor, cliente o plataforma no disponible.
- **NO_EJECUTADO**: todavía no se realizó.
- **NO_APLICA**: aprobado explícitamente por el responsable técnico y de negocio.

Un control externo sólo queda cerrado con **VALIDADO_EXTERNO**. Esta acta no sustituye `docs/release-checklist.md` ni autoriza producción por sí sola.

## Identificación

- Clasificación del entorno: **Local aislado / Staging externo**
- Release/SHA:
- URL CI y artefacto de release:
- Ventana UTC:
- Responsable técnico:
- Snapshot de datos (identificador anonimizado):
- Digests API / migración / web / field:
- Digest PostgreSQL:
- Exposición de red autorizada:
- Canal de incidente:

## Ejecución

| Control | Ámbito | Estado | Evidencia/URL | Responsable | Hora UTC |
| --- | --- | --- | --- | --- | --- |
| `SHA256SUMS` y manifiesto verificados | Local/CI |  |  |  |  |
| Digests desplegados coinciden; no hubo build | Local/externo |  |  |  |  |
| Migraciones y catálogo RBAC | Local |  |  |  |  |
| Readiness/live y métricas privadas | Local |  |  |  |  |
| TLS, HSTS y `/api/v1` same-origin desde fuera de la red | Externo |  |  |  |  |
| Acceso de piloto limitado a red local/VPN y participantes autorizados | Local/piloto |  |  |  |  |
| Login, refresh, logout y bootstrap retirado | Local |  |  |  |  |
| Revocación de rol bloquea y purga PWA | Local/piloto |  |  |  |  |
| Publicación con portada corporativa/fallback | Local |  |  |  |  |
| Tareas y reportes online | Local |  |  |  |  |
| Operación offline→online sin duplicados | Local/piloto |  |  |  |  |
| Cache Storage no contiene `/api/` | Local |  |  |  |  |
| Logs, métricas, alertas y trazas externos | Externo |  |  |  |  |
| Backup/checksum cifrado off-host | Externo |  |  |  |  |
| Restore dentro del RPO/RTO aprobado | Externo |  |  |  |  |
| Rollback a digests previos ensayado | Local/externo |  |  |  |  |

## Línea base para piloto

Defina estos valores con el propietario y el cliente piloto antes de iniciar usuarios reales. No invente resultados ni recopile PII en esta acta.

| Métrica | Línea base | Meta acordada | Fuente | Resultado observado | Responsable |
| --- | --- | --- | --- | --- | --- |
| Usuarios invitados que completan el flujo inicial |  |  | Registro de piloto |  |  |
| Reportes creados y sincronizados sin duplicados |  |  | Acta de dispositivo / auditoría |  |  |
| Tiempo de creación a aprobación de reporte |  |  | Exportación operativa |  |  |
| Tareas completadas en el flujo piloto |  |  | Exportación operativa |  |  |
| Incidencias bloqueantes por dispositivo |  |  | Registro de soporte |  |  |
| Disposición de pago o decisión de continuidad |  |  | Responsable de negocio |  |  |

## Incidencias y conclusión

- Incidencias bloqueantes:
- Incidencias aceptadas (riesgo / propietario / vencimiento):
- Dependencias externas pendientes y fecha objetivo:
- Resultado de staging: **PENDIENTE**
- Firma técnica / fecha UTC:
