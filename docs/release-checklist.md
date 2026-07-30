# Checklist Go/No-Go de release

## Identificación y evidencia

Registrar antes de promover:

- Release candidato y commit SHA completo.
- Digests OCI (`sha256:...`) de API, migración, portal y PWA.
- URL de ejecución CI y artefactos SBOM CycloneDX.
- Responsable técnico, aprobador de negocio, ventana y canal de incidente.
- Backup/checksum pre-migración y ubicación cifrada off-host.

La ausencia de cualquier identificador, digest o evidencia obligatoria produce **No-Go**.

## Puertas automatizadas

Todas deben finalizar en verde sobre el mismo commit:

- [ ] Instalación reproducible: `pnpm install --frozen-lockfile`.
- [ ] Unitarias y cobertura: `pnpm test:coverage` (líneas/funciones/statements ≥80 %, branches ≥75 % sobre módulos críticos).
- [ ] Integración API: auth, validación, 404, conflicto, membresía e idempotencia exactamente una vez.
- [ ] E2E portal y PWA; accesibilidad sin impactos axe `serious`/`critical` en WCAG A/AA.
- [ ] Recarga PWA offline controlada por service worker; ninguna URL `/api/` en Cache Storage.
- [ ] Typecheck, Oxlint y builds de los tres productos.
- [ ] `pnpm audit --prod` sin vulnerabilidades conocidas no aceptadas.
- [ ] Gitleaks `8.30.1` sobre árbol e historial. `ggshield` es evidencia adicional sólo si CLI y autenticación están disponibles; no sustituye Gitleaks.
- [ ] Cuatro imágenes escaneadas con Trivy `0.72.0`, HIGH/CRITICAL, `--ignore-unfixed`, y SBOM por imagen.
- [ ] Load smoke: error ≤1 % y p95 ≤750 ms con 60 solicitudes/concurrencia 6.
- [ ] `git diff --check` sin errores de whitespace.

Ejecución local integral de código, sistema y Compose: `corepack pnpm release:validate`. Las puertas Gitleaks, Trivy y SBOM se ejecutan adicionalmente en CI sobre el SHA candidato; CI también repite calidad, sistema, Compose y whitespace en Linux. Las imágenes de escaneo se fijan por digest.

### Evidencia del candidato

No conserve resultados de un árbol de trabajo como si fueran evidencia del release. Para cada SHA candidato, adjunte:

- URL del run CI verde y artefacto `opeconca-release-<SHA>`.
- `release-manifest.json`, `images.env`, `SHA256SUMS`, metadata de configuración de las cuatro imágenes probadas y cuatro SBOM.
- Resultado Trivy de los cuatro digests publicados y Gitleaks del mismo historial.
- Reporte de cobertura, pruebas de sistema y load smoke del mismo SHA.

Los IDs de imágenes locales, capturas sin URL verificable y resultados previos a un cambio no satisfacen esta puerta. La publicación real sólo ocurre tras un push a `main`; mientras no exista commit, run y digests OCI, el estado es **No-Go externo** aunque la validación local sea verde.

## Puertas operativas de staging

Complete `docs/templates/staging-validation.md` y adjúntela a la decisión:

- [ ] DNS, certificado TLS válido, redirección HTTP→HTTPS, HSTS y ruta same-origin `/api/v1` comprobados desde fuera de la red.
- [ ] Secret manager conectado; secretos distintos, rotables y sin valores de ejemplo; bootstrap inicial retirado.
- [ ] Los digests desplegados coinciden byte a byte con `release-manifest.json`; el host no ejecutó `build`.
- [ ] Migración ensayada desde snapshot representativo y rollback de aplicación con digests anteriores documentado.
- [ ] Readiness, login/logout, revocación de rol, Actualidad con medio corporativo, Centro de trabajo y reporte online verificados.
- [ ] Reporte y operación offline→online verificados; al revocar acceso, la PWA bloquea el módulo y purga datos del propietario al reconectar.
- [ ] Logs, métricas, alertas y trazas llegan al backend externo sin credenciales/PII sensible.
- [ ] Backup programado, cifrado off-host y restauración documentada en `docs/templates/restore-drill.md` dentro del RPO/RTO aprobado.
- [ ] Piloto completado en navegadores/escritorios y dispositivos de campo mediante `docs/templates/device-pilot.md`; incidencias bloqueantes cerradas.

Estas puertas dependen del proveedor/propietario y no pueden declararse verdes sólo con validación local.

## Decisión

Complete `docs/templates/go-no-go.md`. **Go** exige todas las puertas automatizadas y operativas, aprobación técnica y aprobación del propietario. Cualquier fallo de migración, auth/permisos, pérdida offline, vulnerabilidad HIGH/CRITICAL no aceptada, secreto detectado, restauración fallida o piloto bloqueante es **No-Go**.

Registrar decisión, fecha/hora UTC, aprobadores, excepciones con propietario/vencimiento y enlace al rollback. Una excepción nunca puede ocultar una prueba no ejecutada ni aceptar pérdida de datos, acceso indebido o imposibilidad de restauración.
