# Plan por fases para producción — OPECONCA

## Objetivo

Convertir el MVP local en una plataforma operativa desplegable, segura, observable y recuperable, conectando portal, API y aplicación de campo sin perder la capacidad offline.

## Principios

- Seguridad y permisos se validan siempre en servidor.
- La PWA opera offline mediante outbox e idempotencia; IndexedDB no es la fuente definitiva.
- Los despliegues son reproducibles, inmutables y reversibles.
- Migraciones y releases mantienen compatibilidad hacia atrás.
- Ningún secreto real vive en el repositorio o en una imagen.
- Producción requiere evidencia: pruebas, métricas, backups restaurables y runbooks.

## Fase 0 — Baseline y reducción de riesgo

**Entregables**
- Dependencias sin vulnerabilidades críticas o altas no aceptadas.
- Cabeceras HTTP productivas para portal, PWA y API.
- Swagger condicionado por entorno.
- Política de cookies, CORS, proxy y variables productivas documentada.
- Escaneo de secretos y dependencias incorporado a CI.

**Criterio de salida**
- Typecheck, lint, build y audit pasan.
- Ningún valor de ejemplo puede iniciar la API en producción.

## Fase 1 — API de negocio

**Entregables**
- Usuarios y roles.
- Clientes y contactos.
- Proyectos, miembros y estados.
- Reportes de campo con flujo borrador → enviado → aprobado/rechazado.
- Idempotencia, paginación, validación y auditoría.
- Contratos compartidos y OpenAPI actualizado.

**Criterio de salida**
- Cada endpoint exige el permiso correcto y valida pertenencia al proyecto cuando corresponde.
- Pruebas de integración cubren rutas felices, 401, 403, 404 y conflictos.

## Fase 2 — Portal administrativo

**Entregables**
- Navegación real y pantallas de usuarios, clientes, proyectos y reportes.
- Estados de carga, vacío, error y reintento.
- Formularios accesibles y confirmaciones para acciones destructivas.
- Sesión renovable con timeout de red y recuperación de errores.

**Criterio de salida**
- Un administrador puede completar los flujos principales sin usar Swagger o SQL.

## Fase 3 — OPECONCA Campo sincronizable

**Entregables**
- Inicio de sesión y contexto de usuario/proyecto.
- Captura de reportes del dominio OPECONCA.
- IndexedDB versionado con stores de entidades, outbox y metadatos de sincronización.
- Reintentos con backoff, idempotencia y resolución explícita de conflictos.
- Estado visible: local, pendiente, sincronizando, sincronizado y error.
- Preparación para adjuntos mediante URLs firmadas.

**Criterio de salida**
- Un reporte creado sin red se sincroniza exactamente una vez al recuperar conectividad.
- Actualizar el service worker no elimina información local.

## Fase 4 — Plataforma productiva

**Entregables**
- Compose productivo de referencia y adaptación a la plataforma elegida.
- Reverse proxy TLS, dominios reales y health/readiness/startup probes.
- Imágenes multi-stage, usuario no-root, filesystem restringido y límites.
- PostgreSQL con roles separados y estrategia de migración expand/contract.
- Secret manager y almacenamiento de objetos conectables por variables.

**Criterio de salida**
- Staging reproduce la topología productiva y supera smoke postdespliegue.

## Fase 5 — Observabilidad y recuperación

**Entregables**
- Logs JSON con request/correlation ID.
- Métricas, trazas y captura sanitizada de errores.
- Alertas y dashboards para disponibilidad, latencia, errores y dependencias.
- Backups cifrados, PITR, retención y restauración ensayada.
- Runbooks de incidente, rollback, rotación de secretos y recuperación.

**Criterio de salida**
- Se demuestra una restauración dentro del RPO/RTO acordado.

## Fase 6 — Calidad y release

**Entregables**
- Pruebas unitarias, integración, E2E, accesibilidad y offline.
- CI con lint, tipos, tests, build, audit, secretos y escaneo de imágenes.
- Imágenes etiquetadas por commit y publicadas por digest.
- Promoción staging → producción y rollback documentado.

**Criterio de salida**
- Release candidate supera todas las puertas, prueba de carga y piloto controlado.

## Dependencias externas para activación real

La implementación puede dejar contratos y plantillas preparados, pero la activación requiere decisiones del propietario:

- Dominios y DNS.
- Proveedor de TLS/ingress.
- Secret manager.
- PostgreSQL gestionado o estrategia HA.
- Almacenamiento S3-compatible.
- Proveedor de correo/notificaciones.
- Plataforma de logs, métricas, tracing y alertas.
- RPO, RTO, retención y región de datos.

## Orden de liberación recomendado

1. Completar Fases 0 y 1 en una rama de integración.
2. Desplegar Fases 2 y 3 en staging con datos sintéticos.
3. Ejecutar Fases 4 y 5 sobre la plataforma elegida.
4. Cerrar Fase 6, realizar piloto y emitir decisión Go/No-Go.
