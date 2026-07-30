# Runbook de incidentes y observabilidad

## Señales disponibles

La API emite un objeto JSON por línea en `stdout`/`stderr`. Los registros de petición contienen `requestId`, `traceId`, `spanId`, método, ruta normalizada, estado, duración y, cuando existe, ID de usuario; nunca incluyen body, query string, cookies ni cabeceras. Las claves sensibles y patrones de credenciales se redactan de forma defensiva. El cliente recibe `X-Request-ID` y `traceparent`; use cualquiera para correlacionar un error sin pedir tokens ni datos personales.

`GET /api/v1/metrics` usa formato Prometheus y requiere `Authorization: Bearer <METRICS_TOKEN>`. No debe publicarse en Internet. Expone:

- `opeconca_http_requests_total`: volumen y errores por método/ruta/estado.
- `opeconca_http_request_duration_seconds`: histograma de latencia.
- `opeconca_http_requests_in_flight`: concurrencia.
- `opeconca_postgresql_up` y `opeconca_postgresql_probe_duration_seconds`: última prueba de readiness.
- uptime y memoria RSS/heap del proceso.

La ruta, no la URL solicitada, se usa como etiqueta para limitar cardinalidad. No añada IDs de usuario/proyecto ni request IDs como labels.

## SLO y alertas iniciales

Línea base hasta completar una prueba de carga y aprobar objetivos de negocio:

| Señal | Advertencia | Crítica |
| --- | --- | --- |
| Disponibilidad externa | 2 fallos consecutivos | 5 minutos sin servicio |
| Readiness/API o `postgresql_up=0` | 2 minutos | 5 minutos |
| 5xx | >5% durante 5 min | >10% durante 5 min |
| Latencia p95 | >1 s durante 10 min | >2.5 s durante 5 min |
| Memoria del contenedor | >80% durante 10 min | >90% durante 5 min/OOM |
| Disco de host/volumen PostgreSQL | >80% | >90% |
| Backup | última ejecución falló | antigüedad >26 h |
| Certificado | vence en <30 días | vence en <14 días; emergencia <7 |

Objetivo inicial: 99.9% de disponibilidad mensual para API y p95 menor de 1 segundo en rutas interactivas, excluyendo mantenimiento anunciado. Revise falsos positivos y ajuste sólo con evidencia.

## Respuesta

1. Registre hora, versión (`serviceVersion`), alcance y severidad. P1: pérdida/corrupción de datos, acceso indebido o indisponibilidad total; P2: degradación importante; P3: impacto limitado.
2. Confirme desde fuera y desde loopback: `health/live`, `health/ready`, estado Compose y métricas. No reinicie antes de preservar logs si hay corrupción o incidente de seguridad.
3. Correlacione por `requestId`/`traceId`; compare 5xx, p95, memoria, disco y PostgreSQL. No copie tokens, cookies, dumps ni datos personales al ticket.
4. Contenga: retire tráfico, deshabilite la operación afectada o ejecute rollback. Para datos, siga `backup-restore.md`; para credenciales, `secret-rotation.md`.
5. Valide recuperación con readiness y flujos de autenticación, publicaciones, tareas y reportes. Reabra tráfico gradualmente.
6. Cierre con línea de tiempo, causa, impacto, datos afectados, RPO/RTO observado y acciones con responsable/fecha.

## Fallos de telemetría

La caída del scraper o colector no debe tumbar la API. Si faltan métricas pero `ready` funciona, diagnostique token, conectividad privada y antigüedad del scrape; use logs JSON y probes como respaldo. Si los logs contienen un secreto, trate el destino como comprometido, restrinja acceso y rote el secreto siguiendo el runbook; no intente ocultarlo borrando evidencia sin preservar una copia forense autorizada.
