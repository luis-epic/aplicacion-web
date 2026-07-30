# Acta Go/No-Go

## Regla de decisión

La evidencia local o de CI puede cerrar controles técnicos locales, pero no sustituye staging externo, recuperación off-host, observabilidad externa ni piloto con participantes reales. La decisión final permanece en **NO-GO** hasta que todas las puertas obligatorias tengan evidencia y firmas.

Estados permitidos: **GO**, **NO-GO**, **VALIDADO_LOCAL**, **PENDIENTE_EXTERNO**, **NO_EJECUTADO** y **NO_APLICA**. Sólo `GO` cierra una puerta de producción; `VALIDADO_LOCAL` nunca la cierra por sí solo.

## Candidato

- Release y SHA completo:
- URL del run CI:
- Artefacto `opeconca-release-<SHA>` y checksum:
- Manifiesto/digests:
- Ventana UTC:
- Entorno evaluado: **Local aislado / Staging externo / Producción**
- Rollback (manifiesto anterior):
- Backup/checksum pre-migración y ubicación cifrada off-host:
- Responsable técnico:
- Propietario de negocio:
- Responsable de operaciones:
- Canal de incidente durante la ventana:

## Puertas técnicas y operativas

| Puerta | Ámbito | Estado | Evidencia | Aprobador |
| --- | --- | --- | --- | --- |
| Calidad, sistema, cobertura y carga | CI/local |  |  |  |
| Secretos, vulnerabilidades, SBOM e integridad de artefactos | CI |  |  |  |
| Staging representativo con los digests aprobados | Local/externo |  |  |  |
| DNS, TLS público y edge/ingress externos | Externo |  |  |  |
| Logs, métricas, trazas y alertas en backend externo | Externo |  |  |  |
| Secret manager externo y rotación operativa | Externo |  |  |  |
| Backup cifrado off-host, retención y restauración ensayada | Externo |  |  |  |
| PITR/WAL y RPO/RTO aprobados, cuando aplique | Externo |  |  |  |
| Piloto de dispositivos | Piloto real |  |  |  |
| Plan de migración y rollback ensayado | Local/externo |  |  |  |

## Perfil comercial recomendado para piloto (pendiente de aceptación)

Esta guía no representa un contrato, un precio aprobado ni una aprobación del cliente. Use los siguientes límites como propuesta inicial y sustitúyalos únicamente por condiciones aceptadas y trazables:

- Piloto de cuatro semanas, limitado a un equipo, flujo prioritario y participantes autorizados; no incluye procesos financieros, operaciones críticas ni datos sensibles.
- Acta o acuerdo breve con alcance, periodo, usuarios/dispositivos por alias, red controlada, datos permitidos, canal de soporte, severidades, criterios de éxito y decisión de cierre.
- Validar disposición real de continuidad o pago mediante un piloto pagado o una tarifa nominal acreditable a contratación posterior. El precio definitivo se define después de observar valor, adopción y coste de soporte.
- Mantener **NO-GO** si hay una incidencia P1 sin resolver, pérdida o acceso indebido a datos, ausencia de responsables/aprobaciones o exposición pública no autorizada.
- La decisión del piloto sólo puede ser **CONTINUAR**, **ITERAR** o **DETENER**. Ninguna de esas decisiones autoriza producción pública.

## Preparación comercial y de piloto

| Criterio | Estado | Evidencia | Responsable |
| --- | --- | --- | --- |
| Organización y caso de uso piloto definidos |  |  |  |
| Alcance, periodo y participantes autorizados |  |  |  |
| Métricas de éxito y línea base acordadas |  |  |  |
| Modelo de precio o decisión comercial a validar |  |  |  |
| Canal de soporte, severidades y escalamiento definidos |  |  |  |
| Política de datos y dispositivos aceptada |  |  |  |
| Resultado real del piloto: CONTINUAR / ITERAR / DETENER |  |  |  |
| Incidencias bloqueantes del piloto cerradas |  |  |  |

## Métricas de resultado del piloto

| Métrica | Meta acordada | Observado | Fuente | Aprobador |
| --- | --- | --- | --- | --- |
| Adopción del flujo prioritario |  |  |  |  |
| Sincronización offline sin duplicados |  |  |  |  |
| Tiempo de ciclo operativo |  |  |  |  |
| Incidencias bloqueantes |  |  |  |  |
| Disposición de continuidad o pago |  |  |  |  |

## Dependencias y excepciones

| Dependencia o excepción | Riesgo | Mitigación | Propietario | Fecha objetivo/Vence UTC | Estado |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

No se permiten excepciones para pérdida/corrupción de datos, acceso indebido, secretos expuestos, vulnerabilidades críticas no aceptadas, restauración fallida o ausencia de evidencia del SHA/digests. Una dependencia externa pendiente requiere **NO-GO** para producción pública.

## Decisión

- Decisión final: **NO-GO hasta completar y firmar**
- Alcance de la decisión: **piloto controlado / producción pública**
- Responsable técnico / firma / fecha UTC:
- Propietario de negocio / firma / fecha UTC:
- Responsable de operaciones / firma / fecha UTC:
