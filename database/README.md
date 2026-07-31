# FERZU POS — Migraciones SQL

## Orden de ejecución

Ejecutar en Supabase → SQL Editor → New query → Run (en este orden):

| Archivo | Descripción | Cuándo ejecutar |
|---------|-------------|-----------------|
| `001_schema_inicial.sql` | Tablas base, funciones y triggers | Primera instalación |
| `002_schema_v2.sql` | Extensiones v2: citas, taller, minimarket | Primera instalación |
| `003_views.sql` | Vistas para reportes y dashboard | Primera instalación |
| `004_rls_policies.sql` | Row Level Security multi-tenant | Primera instalación |
| `005_migration_v3.sql` | Columnas adicionales, fixes (idempotente) | Siempre seguro re-ejecutar |

## Reglas

- **Nunca editar** los archivos `00x_*.sql` una vez ejecutados en producción.
- Para nuevos cambios: crear `006_nombre_descriptivo.sql`.
- `005_migration_v3.sql` y superiores usan `IF NOT EXISTS` — son seguros para re-ejecutar.
- Los archivos `schema.sql`, `schema_v2.sql`, `views_v1.sql` en la raíz son **legado** — 
  no ejecutar directamente, usar las versiones numeradas aquí.

## Conexión Supabase

- **URL:** `https://laimnfckldpiovgbugyr.supabase.co`
- **Dashboard:** [app.supabase.com](https://app.supabase.com)
