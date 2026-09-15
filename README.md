# Tareas INTEC — Kanban

Tablero Kanban (HTML/CSS/JS vanilla + Supabase) desplegado en GitHub Pages.

- 5 columnas: Sin empezar · En curso · En espera · Parado · Listo
- Drag & drop, filtros por mes, buscador, prioridad, categorías, subtareas,
  historial de cambios, contadores/estadísticas, tema claro/oscuro, tiempo real.
- Acceso protegido con Supabase Auth (email/contraseña) — sin login no se ve nada.

## 1. Crear el esquema en Supabase

1. Entra al proyecto en https://supabase.com/dashboard
2. Ve a **SQL Editor > New query**
3. Pega y ejecuta el contenido de [`supabase/schema.sql`](supabase/schema.sql)

Esto crea las tablas `tasks`, `subtasks` y `task_logs`, sus triggers
(actualización de `updated_at`, auto-relleno de `terminada` al pasar a
"Listo", registro automático en `task_logs`), las políticas de Row Level
Security (solo usuarios autenticados) y activa Realtime en `tasks`/`subtasks`.

## 2. Crear tu usuario (login de la app)

Ve a **Authentication > Users > Add user** en el dashboard de Supabase y crea
un usuario con tu email y una contraseña. Con RLS activado, es el único
usuario que podrá entrar en el tablero.

## 3. Importar las 308 tareas del Excel (seed)

```bash
cd seed
npm install
cp .env.example .env   # y rellena SEED_EMAIL / SEED_PASSWORD / EXCEL_PATH
node seed.js
```

También puedes pasar la ruta del Excel como argumento en vez de `EXCEL_PATH`:

```bash
node seed.js "C:\ruta\Tareas 2026.xlsx"
```

El script inicia sesión con tu usuario (necesario porque las tablas exigen
autenticación) y crea las tareas con `prioridad = Media` y `categoria =
General` por defecto, tal como estaban en el Excel.

## 4. Desarrollo local

No requiere build. Basta con servir los archivos estáticos, por ejemplo:

```bash
npx serve .
```

## 5. Despliegue en GitHub Pages

El repositorio ya está configurado para publicar `index.html` desde la raíz
de `main` vía GitHub Pages.

## Estructura

```
index.html          Tablero (login + app + modal)
css/styles.css       Estilos (tema claro/oscuro, responsive)
js/config.js          URL y anon key de Supabase (pública; el acceso real lo protege RLS + Auth)
js/app.js             Lógica: auth, datos, render, drag&drop, modal, realtime
supabase/schema.sql   Tablas, triggers, RLS y Realtime
seed/seed.js           Importa Tareas_2026.xlsx a Supabase
```
