-- =============================================================================
-- Tareas INTEC · esquema de base de datos (Supabase / PostgreSQL)
-- Ejecutar completo en: Supabase Dashboard > SQL Editor > New query > Run
-- Es idempotente: se puede volver a ejecutar sin duplicar objetos.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Tabla: tasks
-- -----------------------------------------------------------------------------
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  status      text not null default 'Sin empezar'
              check (status in ('Sin empezar','En curso','En espera','Parado','Listo')),
  mes         text not null
              check (mes in ('Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre')),
  notas       text default '',
  prioridad   text not null default 'Media'
              check (prioridad in ('Alta','Media','Baja')),
  categoria   text not null default 'General'
              check (categoria in ('Marketing','Diseño','Web','Mailing','Tienda','Admin','General')),
  marca       text not null default 'General'
              check (marca in ('Intec','Sumifluid','Jender','CST Iberica','Blizzcool','Blizztherm','General')),
  apuntada    date,
  terminada   date,
  horas       numeric,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_tasks_mes on public.tasks (mes);
create index if not exists idx_tasks_status on public.tasks (status);

-- -----------------------------------------------------------------------------
-- Migración: añade "marca" si la tabla ya existía sin esa columna
-- (una instalación nueva ya la trae en el CREATE TABLE de arriba).
-- -----------------------------------------------------------------------------
alter table public.tasks add column if not exists marca text not null default 'General';

alter table public.tasks drop constraint if exists tasks_marca_check;
alter table public.tasks add constraint tasks_marca_check
  check (marca in ('Intec','Sumifluid','Jender','CST Iberica','Blizzcool','Blizztherm','General'));

-- -----------------------------------------------------------------------------
-- Tabla: subtasks (checklist dentro de cada tarea)
-- -----------------------------------------------------------------------------
create table if not exists public.subtasks (
  id       uuid primary key default gen_random_uuid(),
  task_id  uuid not null references public.tasks(id) on delete cascade,
  texto    text not null,
  done     boolean not null default false,
  pos      integer not null default 0
);

create index if not exists idx_subtasks_task_id on public.subtasks (task_id);

-- -----------------------------------------------------------------------------
-- Tabla: task_logs (historial automático de cambios de estado)
-- -----------------------------------------------------------------------------
create table if not exists public.task_logs (
  id               uuid primary key default gen_random_uuid(),
  task_id          uuid not null references public.tasks(id) on delete cascade,
  status_anterior  text,
  status_nuevo     text not null,
  changed_at       timestamptz not null default now()
);

create index if not exists idx_task_logs_task_id on public.task_logs (task_id);

-- -----------------------------------------------------------------------------
-- Trigger: mantener updated_at al día
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Trigger: autorrellenar "terminada" cuando el estado pasa a "Listo"
-- (solo si no había fecha ya asignada, para no pisar fechas históricas del seed)
-- -----------------------------------------------------------------------------
create or replace function public.autofill_terminada()
returns trigger language plpgsql as $$
begin
  if new.status = 'Listo' and new.terminada is null then
    new.terminada = current_date;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tasks_autofill_terminada on public.tasks;
create trigger trg_tasks_autofill_terminada
before insert or update on public.tasks
for each row execute function public.autofill_terminada();

-- -----------------------------------------------------------------------------
-- Trigger: registrar cada cambio de estado en task_logs
-- -----------------------------------------------------------------------------
create or replace function public.log_status_change()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.task_logs (task_id, status_anterior, status_nuevo)
    values (new.id, null, new.status);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.task_logs (task_id, status_anterior, status_nuevo)
    values (new.id, old.status, new.status);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tasks_log_status on public.tasks;
create trigger trg_tasks_log_status
after insert or update on public.tasks
for each row execute function public.log_status_change();

-- -----------------------------------------------------------------------------
-- Row Level Security: solo usuarios autenticados (Supabase Auth) pueden
-- leer/escribir. La app exige login antes de mostrar el tablero, y la
-- anon key pública queda inofensiva sin una sesión válida.
-- -----------------------------------------------------------------------------
alter table public.tasks enable row level security;
alter table public.subtasks enable row level security;
alter table public.task_logs enable row level security;

drop policy if exists "authenticated_all_tasks" on public.tasks;
create policy "authenticated_all_tasks" on public.tasks
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "authenticated_all_subtasks" on public.subtasks;
create policy "authenticated_all_subtasks" on public.subtasks
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "authenticated_all_task_logs" on public.task_logs;
create policy "authenticated_all_task_logs" on public.task_logs
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- -----------------------------------------------------------------------------
-- Realtime: publicar cambios de tasks y subtasks
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'subtasks'
  ) then
    alter publication supabase_realtime add table public.subtasks;
  end if;
end;
$$;
