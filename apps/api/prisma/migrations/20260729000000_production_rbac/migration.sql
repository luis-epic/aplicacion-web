-- Provision the authorization catalogue independently from development seeds.
INSERT INTO "Permission" ("id", "code", "description") VALUES
  ('10000000-0000-4000-8000-000000000001', 'users.read', 'Consultar usuarios.'),
  ('10000000-0000-4000-8000-000000000002', 'users.manage', 'Administrar usuarios y roles.'),
  ('10000000-0000-4000-8000-000000000003', 'clients.read', 'Consultar clientes.'),
  ('10000000-0000-4000-8000-000000000004', 'clients.manage', 'Administrar clientes.'),
  ('10000000-0000-4000-8000-000000000005', 'projects.read', 'Consultar proyectos accesibles.'),
  ('10000000-0000-4000-8000-000000000006', 'projects.manage', 'Administrar proyectos y miembros.'),
  ('10000000-0000-4000-8000-000000000007', 'fieldReports.create', 'Crear reportes de campo.'),
  ('10000000-0000-4000-8000-000000000008', 'fieldReports.read', 'Consultar reportes de campo.'),
  ('10000000-0000-4000-8000-000000000009', 'fieldReports.approve', 'Aprobar o rechazar reportes de campo.'),
  ('10000000-0000-4000-8000-000000000010', 'publications.read', 'Consultar publicaciones autorizadas.'),
  ('10000000-0000-4000-8000-000000000011', 'publications.create', 'Crear publicaciones.'),
  ('10000000-0000-4000-8000-000000000012', 'publications.manage', 'Editar y enviar publicaciones a revisión.'),
  ('10000000-0000-4000-8000-000000000013', 'publications.publish', 'Publicar y archivar contenido.'),
  ('10000000-0000-4000-8000-000000000014', 'tasks.read', 'Consultar tareas autorizadas.'),
  ('10000000-0000-4000-8000-000000000015', 'tasks.create', 'Crear tareas.'),
  ('10000000-0000-4000-8000-000000000016', 'tasks.manage', 'Administrar tareas.'),
  ('10000000-0000-4000-8000-000000000017', 'tasks.assign', 'Asignar tareas.'),
  ('10000000-0000-4000-8000-000000000018', 'tasks.complete', 'Completar tareas.'),
  ('10000000-0000-4000-8000-000000000019', 'tasks.approve', 'Aprobar tareas terminadas.')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "Role" ("id", "code", "name", "description") VALUES
  ('20000000-0000-4000-8000-000000000001', 'ADMIN', 'Administrador', 'Acceso administrativo completo.'),
  ('20000000-0000-4000-8000-000000000002', 'FIELD_WORKER', 'Operador de campo', 'Opera reportes y tareas asignadas desde dispositivos de campo.'),
  ('20000000-0000-4000-8000-000000000003', 'FIELD_SUPERVISOR', 'Supervisor de campo', 'Supervisa proyectos, reportes y tareas operativas.'),
  ('00000000-0000-4000-8000-000000000002', 'PUBLICATION_PUBLISHER', 'Publicador de actualidad', 'Crea, revisa y publica contenido corporativo.')
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description";

-- These roles are platform-managed. Rebuild only their grants, preserving custom roles.
DELETE FROM "RolePermission"
WHERE "roleId" IN (
  SELECT "id" FROM "Role" WHERE "code" IN ('ADMIN', 'FIELD_WORKER', 'FIELD_SUPERVISOR', 'PUBLICATION_PUBLISHER')
);

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."code" = 'ADMIN';

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."code" IN (
  'projects.read', 'fieldReports.create', 'fieldReports.read',
  'publications.read', 'tasks.read', 'tasks.complete'
)
WHERE role."code" = 'FIELD_WORKER';

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."code" IN (
  'clients.read', 'projects.read', 'projects.manage',
  'fieldReports.create', 'fieldReports.read', 'fieldReports.approve',
  'publications.read', 'tasks.read', 'tasks.create', 'tasks.manage',
  'tasks.assign', 'tasks.complete', 'tasks.approve'
)
WHERE role."code" = 'FIELD_SUPERVISOR';

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."code" IN (
  'publications.read', 'publications.create', 'publications.manage', 'publications.publish',
  'tasks.read', 'tasks.create'
)
WHERE role."code" = 'PUBLICATION_PUBLISHER';
