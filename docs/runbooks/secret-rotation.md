# Runbook de rotación de secretos

## Reglas

Genere valores aleatorios con un gestor de secretos aprobado, nunca en tickets, chat, historial de shell o repositorio. Mantenga permisos mínimos en archivos montados, registre responsable/fecha/servicios y elimine copias temporales. Pruebe en staging. La configuración actual usa un solo valor activo por secreto: no hay ventana automática de doble clave.

## Token de métricas

1. Genere un token distinto de al menos 32 caracteres y actualice `METRICS_TOKEN_FILE` de forma atómica.
2. Actualice primero el scraper con capacidad de usar el valor nuevo al reiniciar la API, o coordine una ventana breve sin scrapes.
3. Recree sólo `api`, valide `/metrics` con el nuevo token y confirme que el anterior devuelve 401.
4. Revoque/elimine el valor anterior y vigile ausencia de métricas.

## JWT de acceso y refresh

Rotar cualquiera de los JWT invalida sesiones que dependan del valor anterior; rote ambos juntos durante una ventana comunicada si se sospecha compromiso.

1. Genere dos valores diferentes, actualice ambos archivos atómicamente y preserve permisos.
2. Recree `api`; valide login, refresh y logout nuevos.
3. Confirme que sesiones anteriores ya no se aceptan y comunique el nuevo inicio de sesión.
4. Elimine valores antiguos. Si la rotación fue por incidente, revise `refresh_sessions` y auditoría antes de cerrar.

## PostgreSQL

La contraseña aparece tanto en `POSTGRES_PASSWORD_FILE` como dentro de `DATABASE_URL_FILE`; deben mantenerse coherentes.

1. Retire tráfico de escritura y cree un backup validado.
2. Cambie la contraseña del rol en PostgreSQL mediante un canal administrativo seguro.
3. Reemplace atómicamente ambos archivos con la nueva contraseña/URL; no imprima la URL.
4. Recree `api` y `api-migrate` según la ventana, valide readiness y un flujo de escritura.
5. Confirme que la credencial anterior falla y elimínela del gestor. Si algo falla, mantenga tráfico retirado; no restaure un dump sólo para revertir una contraseña.

## Credencial administrativa inicial

El bootstrap productivo se ejecuta sólo mediante `infra/compose.bootstrap.yaml`, requiere `ADMIN_BOOTSTRAP_CONFIRM=CREATE_INITIAL_ADMIN` y lee la contraseña desde `ADMIN_PASSWORD_FILE`. Cree el archivo desde el gestor de secretos justo antes de usarlo, valide login/auditoría y elimínelo del host inmediatamente. El comando no rota contraseñas existentes ni reactiva usuarios; no lo use como recuperación. Para una cuenta comprometida, desactívela o cambie su contraseña mediante el flujo administrativo; el cambio de roles/estado debe revocar sesiones y purgar datos PWA al reconectar.

## Frecuencia y emergencia

Rote según política organizacional y siempre ante exposición, salida de personal con acceso, cambio de proveedor o alerta. Para compromiso confirmado: contenga acceso, preserve evidencia, rote primero el secreto que permite mayor privilegio, valide revocación y documente alcance y tiempo de exposición conforme a `incident-observability.md`.
