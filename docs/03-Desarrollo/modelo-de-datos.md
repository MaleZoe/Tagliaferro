# Modelo de datos observado y propuesto

El esquema legado se infiere únicamente de las consultas del repositorio. Las tablas nuevas describen las migraciones preparadas en `database/migrations/`; no se afirma que estén aplicadas.

```mermaid
erDiagram
  AUTH_USERS ||--o| PROFILES : tiene
  AUTH_USERS ||--o| APP_USER_ROLES : recibe
  SPORTS ||--o{ PRODUCTS : clasifica
  PRODUCTS ||--o{ PRODUCT_VARIANTS : ofrece
  AUTH_USERS ||--o{ ORDERS : realiza
  ORDERS ||--|{ ORDER_ITEMS : contiene
  PRODUCT_VARIANTS ||--o{ ORDER_ITEMS : identifica
  AUTH_USERS ||--o{ SALES : registra
  SALES ||--|{ SALE_ITEMS : contiene
  PRODUCT_VARIANTS ||--o{ SALE_ITEMS : vende
  PRODUCT_VARIANTS ||--o{ INVENTORY_MOVEMENTS : audita
  AUTH_USERS ||--o{ INVENTORY_MOVEMENTS : responsable
  PROJECTS ||--o{ PROJECT_PHASES : organiza
  PROJECTS ||--o{ PROJECT_TASKS : contiene
  PROJECT_PHASES ||--o{ PROJECT_TASKS : agrupa
  AUTH_USERS ||--o{ PROJECT_TASKS : asignado
  PROJECTS ||--o{ PROJECT_HISTORY : registra
```

`profiles`, `sports`, `products`, `product_variants`, `orders` y `order_items` existen como nombres en consultas legadas. `app_user_roles`, `sales`, `sale_items`, `inventory_movements`, `projects`, `project_phases`, `project_tasks` y `project_history` son definiciones propuestas en migraciones revisables. Verificar las relaciones existentes y tipos de ID antes de aplicar.
