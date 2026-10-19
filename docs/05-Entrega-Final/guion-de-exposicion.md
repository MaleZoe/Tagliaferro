# Guion de exposición — Sportshop / Élite Sport

Duración sugerida: 5 a 7 minutos. El guion describe el código del repositorio y separa lo que falta validar con servicios externos.

## Apertura

“Sportshop es una tienda deportiva que se está migrando gradualmente a React, Node.js con Express y Supabase. La página original y su identidad visual se conservan mientras se incorpora una aplicación nueva.”

## Problema y alcance

“La tienda necesita ordenar las responsabilidades entre interfaz, API y base de datos; mantener catálogo, compra e inventario; y proteger operaciones según el rol. Esta entrega incluye vistas React para cliente y personal, endpoints Express y documentación. Las columnas exactas de la base real aún deben contrastarse con Supabase antes de aplicar migraciones o completar la administración de categorías.”

## Recorrido de módulos

1. Mostrar el catálogo y explicar que React consulta la API; el precio y stock se vuelven a consultar en el servidor al crear el pedido.
2. Explicar el retorno de Mercado Pago: volver a la tienda no confirma el pago; el backend consulta el estado, referencia, importe y moneda.
3. Mostrar inventario y POS. Las ventas presenciales usan una clave UUID idempotente, validan precio/stock en la función SQL y conservan el reintento pendiente por cuenta de empleado.
4. Mostrar clientes, empleados, proyectos y reportes. La UI controla navegación y Express verifica los permisos en cada ruta privada.

## Pruebas y límites

“Se ejecutaron 27 pruebas unitarias con Node.js y todas pasaron. También pasó la comprobación de sintaxis del backend y `git diff --check`. No se pudo compilar React porque Vite no está instalado; npm devuelve `ENOTFOUND registry.npmjs.org`. Tampoco se ejecutaron migraciones ni pruebas integrales con Supabase o Mercado Pago.”

## Cierre

“El próximo paso es obtener el esquema de una instancia Supabase de desarrollo, validar RLS, claves, triggers y migraciones, habilitar una instalación de dependencias y correr el flujo con Mercado Pago Sandbox sin cobros reales. Las encuestas están preparadas, pero todavía no se recolectaron respuestas.”

## Si se hace una demostración en vivo

- Usar únicamente una instancia de desarrollo y cuentas de prueba autorizadas.
- Mostrar los módulos sin registrar pagos reales ni datos personales innecesarios.
- Si faltan variables o servicios, presentar el código y las pruebas unitarias e indicar el bloqueo, sin simular una operación exitosa.
