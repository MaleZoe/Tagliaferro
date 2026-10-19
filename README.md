# Élite Sport

Tienda deportiva con una migración gradual desde la versión original HTML/CSS/JavaScript hacia React y una API Node.js + Express. La aplicación original permanece disponible en `index.html` mientras se verifican los nuevos módulos.

## Estado de la migración

- La versión original sigue siendo la página principal y conserva sus recursos.
- `frontend/` contiene catálogo, autenticación React, recuperación de contraseña, checkout, pedidos, inventario, POS, proyectos/tareas, empleados y reportes.
- `backend/server.js` mantiene las rutas originales y publica rutas versionadas; los pedidos y movimientos usan verificaciones server-side.
- Supabase Auth y PostgreSQL existentes se conservan. La migración aditiva de inventario/POS está en `database/migrations/` y debe revisarse antes de ejecutarse.
- El CRUD de categorías y altas de productos con deporte queda pendiente porque no está documentada la columna que relaciona `products` con `sports`.

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

El módulo de empleados invita cuentas mediante el proveedor de correo de Supabase. Las pantallas de inventario, POS, proyectos, empleados y reportes requieren revisar y aplicar las migraciones de `database/migrations/` en una base de desarrollo y asignar manualmente el primer rol administrador.

Para generar la versión de producción de la interfaz: `cd frontend; npm run build`. No se debe ejecutar ninguna migración de base de datos sin revisar antes el esquema real y autorizar el destino.

La API escucha en `http://localhost:3000`; Vite inicia la interfaz en la URL local que informa la consola. Los scripts de conveniencia disponibles desde la raíz son `npm run dev:backend`, `npm run dev:frontend`, `npm run test:backend` y `npm run build:frontend`.

## Documentación de la actividad

Los entregables se organizan en `docs/01-Requerimientos`, `docs/02-Prototipos`, `docs/03-Desarrollo`, `docs/04-Pruebas` y `docs/05-Entrega-Final`. El manual, guion de exposición y presentación editable están en `docs/05-Entrega-Final`. Los documentos distinguen código agregado de módulos pendientes de verificar en servicios reales.
