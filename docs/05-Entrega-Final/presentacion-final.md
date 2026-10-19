# Presentación final — Ciclo de vida de un proyecto en una tienda de deportes

La presentación editable de nueve diapositivas se entrega en `archivos/sportshop-presentacion-final-v2.pptx`.

## Orden y notas para exponer

1. **Portada:** presentar Sportshop / Élite Sport y el objetivo académico.
2. **Problema y objetivo:** explicar la migración gradual y la conservación del sitio original.
3. **Arquitectura:** describir qué resuelve React/Vite, Express y Supabase, y el rol de Mercado Pago.
4. **Ciclo de vida:** relacionar inicio, planificación, ejecución, seguimiento y cierre con proyectos, fases e historial.
5. **Comercio electrónico:** mostrar el recorrido del catálogo al pedido y la verificación de pago server-side.
6. **Inventario y POS:** explicar movimientos auditados, la función transaccional local de ventas presenciales y la validación pendiente del stock online.
7. **Roles:** diferenciar permisos del cliente, empleado y administrador; mencionar que la instancia/RLS requiere validación.
8. **Pruebas:** reportar 27 pruebas unitarias aprobadas, aclarando que no son pruebas integrales con Supabase o Mercado Pago.
9. **Pendientes:** describir el bloqueo de npm, el esquema por confirmar, webhooks y alta de productos/categorías.

## Evidencia y límites

No se incluyen cifras de ventas, respuestas de encuestas ni resultados de entrevistas porque no se recolectaron datos reales. La presentación distingue comportamiento del código y funcionalidades pendientes de validar externamente. La diapositiva de pruebas muestra 27/27 pruebas unitarias; la compilación React sigue bloqueada por la dependencia Vite ausente.
