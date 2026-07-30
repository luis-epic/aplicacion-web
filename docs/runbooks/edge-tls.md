# Checklist del edge TLS

El edge externo es la única terminación TLS; `compose.production.yaml` publica HTTP sólo en `127.0.0.1`. Aplique este checklist en balanceador, ingress o reverse proxy elegido.

## Antes de abrir tráfico

- DNS apunta al edge aprobado y no expone directamente puertos de host, PostgreSQL ni `/api/v1/metrics`.
- Certificados válidos cubren portal, campo y API, con cadena completa y renovación automática probada.
- Sólo TLS 1.2 y 1.3 están habilitados; SSLv2/v3, TLS 1.0/1.1, compresión TLS y renegociación insegura están deshabilitados.
- Use suites modernas recomendadas por el proveedor y priorice forward secrecy; no habilite RC4, 3DES, DES, export, NULL, MD5 ni SHA-1.
- HTTP redirige permanentemente a HTTPS sin aceptar credenciales antes de redirigir.
- Reenvíe `Host`, `X-Forwarded-For` y `X-Forwarded-Proto`; `TRUST_PROXY_HOPS` debe coincidir exactamente con proxies controlados.
- El portal sirve `/api/v1/*` same-origin mediante un proxy interno al servicio API. Si el edge intercepta esa ruta directamente, preserve cookies, `Authorization`, métodos, códigos y cabeceras de correlación; no cambie la URL pública ni recomponga la imagen.
- Preserve `X-Request-ID` y `traceparent`; elimine valores inválidos/no confiables en el edge si genera los propios.
- Limite tamaños de request y timeouts; no reintente automáticamente operaciones de escritura no idempotentes.
- Configure probes: `/health/live` para proceso y `/health/ready` para tráfico. No exponga detalles internos en páginas de error.

## Cabeceras y política

Helmet/Nginx ya aportan cabeceras de aplicación. En el edge añada HSTS sólo después de verificar todos los subdominios: `max-age=31536000; includeSubDomains`; añada `preload` únicamente tras cumplir y aceptar los requisitos del registro preload. No duplique CSP con una política incompatible. Cookies de sesión deben permanecer `Secure`, `HttpOnly` y con el `SameSite` definido por la API.

## Operación

- Monitorice desde una ubicación externa el certificado y los flujos HTTPS.
- Alerte por vencimiento a 30, 14 y 7 días y por fallo de renovación.
- Pruebe renovación y rollback de configuración antes del primer vencimiento.
- Escanee la configuración TLS después de cambios y al menos trimestralmente.
- Restrinja acceso administrativo al edge, registre cambios y mantenga una configuración anterior validada.

## Verificación de release

Confirme redirección HTTP→HTTPS, cadena/certificado/SAN, protocolos, HSTS, CORS desde ambos orígenes, login/refresh/logout, PWA/service worker y propagación de `X-Request-ID`. Registre evidencia sin incluir cookies, tokens ni URLs con credenciales.
