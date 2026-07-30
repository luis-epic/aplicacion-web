# Acta de piloto de dispositivos

## Regla de uso

Esta acta recoge evidencia de participantes reales. No marque escenarios, métricas ni aprobaciones sin una ejecución observada. Un piloto aprobado no habilita producción pública: esa decisión sigue el acta `go-no-go.md` y el checklist de release.

## Perfil operativo recomendado (pendiente de aceptación)

Use este perfil como punto de partida. No convierte campos vacíos en acuerdos, no autoriza usuarios reales y debe ser aceptado por los responsables de negocio, operación, técnica y seguridad/datos antes de iniciar.

- **Alcance:** un equipo, un flujo prioritario y una ubicación o contexto operativo controlado. Excluya procesos financieros, operaciones críticas y datos sensibles de esta primera iteración.
- **Duración y muestra:** cuatro semanas: una de preparación y onboarding, dos de uso supervisado y una de cierre. Recomendar 8–12 participantes de campo, 2 supervisores y 1–2 usuarios administrativos, siempre identificados por alias autorizados.
- **Responsabilidades:** asigne un patrocinador de negocio, responsable operativo, responsable técnico y suplente, punto de soporte y responsable de seguridad/datos. Una persona puede asumir varios roles en un piloto pequeño, pero cada responsabilidad requiere titular y suplente.
- **Acceso:** mantenga staging sin exposición pública; admita sólo red local controlada o VPN aprobada y cuentas individuales con mínimo privilegio. No use cuentas compartidas.
- **Dispositivos:** prefiera equipos corporativos administrados. Para BYOD, exija bloqueo de pantalla, sistema/navegador soportado y actualizado, cifrado cuando esté disponible y aprobación expresa de la política de datos. Ante pérdida o robo, deshabilite cuenta/sesión y acceso VPN; declare borrado remoto únicamente si MDM o el dispositivo lo soporta y se verificó.
- **Preparación comercial:** documente un acta breve con alcance, periodo, soporte, datos permitidos y criterios de salida. Recomendar un piloto pagado o con tarifa nominal acreditable a un contrato posterior; no fije precio final ni declare disposición de pago sin evidencia de valor y aceptación del cliente.

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

## Metas iniciales recomendadas (pendientes de acuerdo)

Estas metas sirven para preparar la conversación con el cliente. Mida la línea base durante los primeros tres días y sustituya los valores sólo por metas aceptadas y proporcionadas a la muestra.

| Métrica | Meta inicial recomendada | Condición de medición |
| --- | --- | --- |
| Activación del primer flujo | ≥ 85 % de participantes autorizados durante la primera semana | Registro de piloto sin PII |
| Sincronización tras recuperar red | ≥ 95 % en ≤ 15 minutos y 0 duplicados no resueltos | Escenarios offline→online y auditoría |
| Tiempo de creación a aprobación | Reducción ≥ 20 % frente a línea base | Exportación operativa comparable |
| Finalización autónoma del flujo | ≥ 80 % de participantes | Observación/entrevista de cierre |
| Incidentes graves | 0 pérdidas de datos, accesos indebidos o P1 sin resolver al cierre | Registro de soporte e incidente |
| Continuidad comercial | Decisión documentada sobre continuar, iterar o detener; hipótesis de pago evaluada | Entrevista con patrocinador de negocio |

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
- Estado antes del cierre: **PENDIENTE** (no es una decisión final).
- Decisión final de piloto: **CONTINUAR / ITERAR / DETENER**
- Resultado piloto: **PENDIENTE**
- Aprobación usuarios / responsable / fecha UTC:
