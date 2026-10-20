# Élite Sport

Tienda deportiva con una migración gradual desde la versión original HTML/CSS/JavaScript hacia React y una API Node.js + Express. La aplicación original permanece disponible en `index.html` mientras se verifican los nuevos módulos.

## Estado de la migración

- La versión original sigue siendo la página principal y conserva sus recursos.
- `frontend/` contiene catálogo, autenticación React, recuperación de contraseña, checkout, pedidos, administración, inventario, POS, caja, clientes, proveedores, configuración, proyectos/tareas y reportes.
- `backend/server.js` mantiene las rutas originales y publica rutas versionadas; los pedidos y movimientos usan verificaciones server-side.
- Supabase Auth y PostgreSQL existentes se conservan. El administrador opera sobre el mismo catálogo y stock que usa el ecommerce; no se crea un catálogo separado.
- Las migraciones administrativas aditivas están en `database/migrations/`: `20261018_001_inventory_pos.sql`, `20261018_002_projects.sql`, `20261020_003_admin_operations.sql`, `20261020_004_pos_cash_payments.sql`, `20261020_005_variant_archiving.sql` y `20261020_006_project_archiving.sql`.
- El alta de productos descubre la relación existente entre `products` y `sports` desde los metadatos de PostgreSQL. El color de cada variante se devuelve también al catálogo y al checkout.

## Requisitos

- Node.js 22 o superior para coincidir con la dependencia Supabase fijada en el lockfile del backend.
- Una instancia Supabase configurada con las tablas que espera `backend/server.js`.
- Credenciales de backend y credencial de Mercado Pago para habilitar el flujo de pedidos actual.

## Desarrollo

En PowerShell, desde la raíz del repositorio, instalá las dependencias en cada aplicación:

```powershell
cd backend
npm install
Copy-Item .env.example .env
npm run dev
```

En otra terminal:

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Completá `frontend/.env` con la URL y la clave anon pública que ya aparecen en `config.js`. Nunca pongas `SUPABASE_SERVICE_KEY` en el frontend.

La interfaz React usa el proxy de Vite para enviar `/api` a `http://localhost:3000`. El backend requiere `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `MP_ACCESS_TOKEN`, `FRONT_URL` y opcionalmente `CORS_ORIGINS`. No copies secretos al frontend.

El módulo de empleados invita cuentas mediante el proveedor de correo de Supabase. Para habilitar todas las pantallas administrativas, compará primero el resultado de `docs/03-Desarrollo/consulta-esquema-supabase-readonly.sql` con tu instancia de desarrollo. Luego ejecutá en el SQL Editor, en este orden, `20261018_001_inventory_pos.sql`, `20261018_002_projects.sql`, `20261020_003_admin_operations.sql`, `20261020_004_pos_cash_payments.sql`, `20261020_005_variant_archiving.sql` y `20261020_006_project_archiving.sql`. El registro público no puede asignar roles. Para otorgar el primer rol administrador a una cuenta Auth, reemplazá el correo de ejemplo en `database/operations/assign_first_admin.sql` y ejecutalo en el SQL Editor.

Para generar la versión de producción de la interfaz: `cd frontend; npm run build`. Las migraciones se entregan como archivos revisables; no se aplican automáticamente. Validalas primero en desarrollo y respaldá la base antes de trasladar cambios a producción.

La API escucha en `http://localhost:3000`; Vite inicia la interfaz en la URL local que informa la consola. Los scripts de conveniencia disponibles desde la raíz son `npm run dev:backend`, `npm run dev:frontend`, `npm run test:backend` y `npm run build:frontend`.

## Documentación de la actividad

Los entregables se organizan en `docs/01-Requerimientos`, `docs/02-Prototipos`, `docs/03-Desarrollo`, `docs/04-Pruebas` y `docs/05-Entrega-Final`. El manual, guion de exposición y presentación editable están en `docs/05-Entrega-Final`. Los documentos distinguen código agregado de módulos pendientes de verificar en servicios reales.
