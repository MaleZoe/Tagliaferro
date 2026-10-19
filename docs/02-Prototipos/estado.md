# Vistas y flujos de la aplicación React

No hay un archivo Figma ni capturas obtenidas desde navegador en este entorno. La implementación reutiliza CSS, marca y recursos de la tienda existente; las rutas listadas abajo están definidas en `frontend/src/App.jsx`. La presentación académica y este inventario sirven como mapa de pantallas, no como evidencia de validación visual en navegador.

| Ruta o vista | Usuario | Función implementada en código |
|---|---|---|
| `/` y `/catalogo` | Público/cliente | Catálogo, búsqueda, filtro por deporte, detalle, talle y carrito |
| Cuenta | Cliente | Registro, inicio, recuperación y actualización de contraseña mediante Supabase Auth |
| Checkout y pedidos | Cliente | Dirección, creación de pedido, redirección a Mercado Pago e historial autenticado |
| `/inventario` | Empleado/administrador | Variantes, existencias, mínimos y movimientos con motivo |
| `/pos` | Empleado/administrador | Venta presencial, reintento con clave idempotente y recibo |
| `/proyectos` | Empleado/administrador | Proyectos, fases, tareas, historial y estados de asignación |
| `/clientes` | Administrador | Consulta y edición limitada de nombre y apellido |
| `/empleados` | Administrador | Invitación, activación y cambios de rol |
| `/reportes` | Administrador | Ingresos, estados de pedidos, inventario bajo y tareas atrasadas |

## Recorrido de compra

Catálogo → selección de talle → carrito → datos de entrega → pedido pendiente → pago externo → consulta server-side del estado → historial de pedidos. No considerar aprobado el pago por el regreso del navegador. La confirmación integral todavía requiere una instancia de desarrollo y credenciales Sandbox.

## Recorrido de venta presencial

Inventario disponible → selección de productos/talles → medio de pago informado → registro de venta desde Express y la función SQL → recibo. Si se pierde la respuesta, la misma cuenta vuelve a intentar el mismo carrito y la misma clave. La garantía durable requiere instalar y probar la migración POS en Supabase de desarrollo.
