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

## Registro mínimo de incidente o solicitud piloto

Abra un ticket o registro con estos campos antes de investigar. El registro puede vivir en la herramienta de soporte elegida; esta sección define el contenido mínimo.

- ID de ticket y hora UTC de detección.
- Entorno, release/SHA y alcance de red.
- Severidad: P1, P2 o P3.
- Impacto operativo y participantes afectados por alias, no por PII.
- Request ID o trace ID, cuando exista.
- Estado de `live`, `ready`, métricas y backup relevante.
- Acciones de contención, responsable y hora UTC.
- Decisión de rollback, si corresponde.
- Resolución, causa, RPO/RTO observado y acciones preventivas con fecha.

No adjunte tokens, cookies, contraseñas, dumps ni capturas con datos personales.

## Respuesta

1. Registre hora, versión (`serviceVersion`), alcance y severidad. P1: pérdida/corrupción de datos, acceso indebido o indisponibilidad total; P2: degradación importante; P3: impacto limitado.
2. Confirme desde fuera y desde loopback: `health/live`, `health/ready`, estado Compose y métricas. No reinicie antes de preservar logs si hay corrupción o incidente de seguridad.
3. Correlacione por `requestId`/`traceId`; compare 5xx, p95, memoria, disco y PostgreSQL. No copie tokens, cookies, dumps ni datos personales al ticket.
4. Contenga: retire tráfico, deshabilite la operación afectada o ejecute rollback. Para datos, siga `backup-restore.md`; para credenciales, `secret-rotation.md`.
5. Valide recuperación con readiness y flujos de autenticación, publicaciones, tareas y reportes. Reabra tráfico gradualmente.
6. Cierre con línea de tiempo, causa, impacto, datos afectados, RPO/RTO observado y acciones con responsable/fecha.

## Escalamiento y soporte de piloto

Antes de invitar participantes, el propietario debe completar y comunicar:

| Rol | Responsable | Canal | Horario/cobertura | Objetivo de primera respuesta | Escala a |
| --- | --- | --- | --- | --- | --- |
| Punto de contacto piloto |  |  |  |  |  |
| Responsable técnico |  |  |  |  |  |
| Responsable de negocio |  |  |  |  |  |
| Responsable de seguridad/datos |  |  |  |  |  |

No se asume un SLA comercial hasta que negocio y el cliente piloto lo acuerden. Ante un P1, notifique de inmediato a los responsables definidos, preserve evidencia y aplique la contención indicada; ante P2/P3, registre prioridad, impacto y siguiente actualización acordada.

## Objetivos operativos recomendados (pendientes de acuerdo)

Use estos objetivos internos para preparar el piloto y reemplácelos por el compromiso acordado. No constituyen un SLA hasta que negocio y el cliente piloto lo acepten por escrito.

| Severidad | Cobertura propuesta | Primera respuesta | Objetivo de siguiente acción |
| --- | --- | --- | --- |
| P1 | Horario/cobertura acordado; notificación inmediata | ≤ 1 hora dentro de cobertura | Contención o plan de mitigación inmediato; escalar a técnica, negocio y seguridad/datos |
| P2 | Horario laboral acordado | ≤ 4 horas laborales | Mitigación o actualización comprometida ≤ 1 día laboral |
| P3 | Horario laboral acordado | Registro y acuse en el siguiente día laboral | Priorización y actualización semanal |

El punto de contacto del piloto debe comunicar el horario y canal únicos antes de invitar participantes. Fuera de la cobertura acordada, registre la hora, preserve evidencia y aplique el procedimiento de escalamiento definido; no prometa atención continua si no existe ese acuerdo.

## Fallos de telemetría

La caída del scraper o colector no debe tumbar la API. Si faltan métricas pero `ready` funciona, diagnostique token, conectividad privada y antigüedad del scrape; use logs JSON y probes como respaldo. Si los logs contienen un secreto, trate el destino como comprometido, restrinja acceso y rote el secreto siguiendo el runbook; no intente ocultarlo borrando evidencia sin preservar una copia forense autorizada.
