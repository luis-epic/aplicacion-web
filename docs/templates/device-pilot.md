# Acta de piloto de dispositivos

## Regla de uso

Esta acta recoge evidencia de participantes reales. No marque escenarios, métricas ni aprobaciones sin una ejecución observada. Un piloto aprobado no habilita producción pública: esa decisión sigue el acta `go-no-go.md` y el checklist de release.

## Alcance y responsables

- Release/SHA y URL de staging:
- Clasificación de acceso: **red local controlada / VPN aprobada / staging externo**
- Organización piloto (nombre o alias autorizado):
- Objetivo e hipótesis del piloto:
- Responsable técnico:
- Responsable de negocio:
- Canal de soporte e incidente:
- Periodo UTC:
- Usuarios/roles piloto (identificadores seudonimizados):
- Datos permitidos y restricción de PII:

## Seguridad e inventario de dispositivos

No registre IMEI, teléfono, correo ni otros identificadores personales en esta acta. Use un alias de dispositivo y guarde el inventario sensible en el sistema corporativo aprobado.

| Alias dispositivo | Propiedad (empresa/BYOD) | SO/versión | Navegador/versión | Red | PWA instalada | Bloqueo de pantalla | Cifrado | MDM/borrado remoto | Resultado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  | Wi-Fi/móvil/intermitente |  |  |  |  |  |

- Política para dispositivos BYOD aprobada: Sí / No / Pendiente
- Pérdida o robo: contacto y procedimiento de revocación/borrado:
- Dispositivos que no cumplen controles mínimos y su tratamiento:

## Métricas y criterios de éxito

Acordar antes de iniciar el piloto. Las metas deben ser proporcionales al tamaño de la muestra y no se sustituyen por métricas técnicas de CI.

| Métrica | Línea base | Meta acordada | Fuente | Resultado observado | Decisión |
| --- | --- | --- | --- | --- | --- |
| Participantes que completan el primer flujo |  |  | Registro de piloto |  |  |
| Reportes offline sincronizados una sola vez |  |  | Evidencia de escenario / auditoría |  |  |
| Tiempo de creación a aprobación |  |  | Exportación operativa |  |  |
| Tareas completadas en el flujo elegido |  |  | Exportación operativa |  |  |
| Incidencias bloqueantes por participante |  |  | Registro de soporte |  |  |
| Valor percibido y disposición de continuidad/pago |  |  | Entrevista de cierre |  |  |

## Escenarios por dispositivo

Para cada escenario, anote alias de dispositivo, hora UTC, request ID o trace ID cuando aplique, y evidencia sin tokens ni PII.

- [ ] Primer login online y descarga sólo de módulos autorizados.
- [ ] Cierre/reapertura y operación offline dentro del TTL.
- [ ] Creación de reporte y transición de tarea offline; sincronización única al volver la red.
- [ ] Portada corporativa carga; recurso inexistente muestra fallback.
- [ ] Cambio de usuario no expone caché del anterior.
- [ ] Revocación 401/403 bloquea acceso y purga IndexedDB/Cache Storage privada.
- [ ] Expiración offline fuerza nuevo login.
- [ ] Actualización del service worker no pierde operaciones pendientes.
- [ ] Accesibilidad básica: teclado, zoom 200 %, lector/pantalla cuando aplique.
- [ ] Rendimiento y consumo aceptables para el dispositivo objetivo.

## Soporte e incidencias

| ID | Severidad P1/P2/P3 | Alias dispositivo | Impacto | Request ID/trace ID | Responsable | Estado | Fecha UTC |
| --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |

Consulte `docs/runbooks/incident-observability.md`. No copie tokens, cookies, dumps ni datos personales al registro de soporte.

## Resultado

- Incidencias bloqueantes y resolución:
- Incidencias aceptadas (riesgo / propietario / vencimiento):
- Aprendizajes de producto y cambios priorizados:
- Decisión de piloto: **CONTINUAR / ITERAR / DETENER / PENDIENTE**
- Resultado piloto: **PENDIENTE**
- Aprobación usuarios / responsable / fecha UTC:
