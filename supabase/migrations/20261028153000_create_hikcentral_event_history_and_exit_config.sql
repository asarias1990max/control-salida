-- Historial de eventos de HikCentral y horarios de salida.
-- Esta migración es idempotente para poder aplicarse en bases ya inicializadas.

create table if not exists public.eventos_hikcentral (
  id uuid primary key default gen_random_uuid(),
  event_fingerprint text not null unique,
  event_id text,
  estudiante_id uuid references public.estudiantes(id) on delete set null,
  codigo_hik text not null,
  fecha_evento timestamptz not null,
  puerta_codigo text,
  puerta_nombre text,
  tipo_evento text,
  tipo_evento_codigo text,
  resultado text,
  datos_originales jsonb not null default '{}'::jsonb,
  sincronizado_en timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_eventos_hikcentral_fecha
  on public.eventos_hikcentral (fecha_evento desc);
create index if not exists idx_eventos_hikcentral_estudiante_fecha
  on public.eventos_hikcentral (estudiante_id, fecha_evento desc);
create index if not exists idx_eventos_hikcentral_codigo_fecha
  on public.eventos_hikcentral (codigo_hik, fecha_evento desc);

alter table public.eventos_hikcentral enable row level security;

create table if not exists public.configuracion_salidas (
  id uuid primary key default gen_random_uuid(),
  nivel_acceso text not null unique,
  hora_inicio time not null,
  hora_fin time not null,
  puertas text[] not null default '{}',
  activo boolean not null default true,
  fuente text not null default 'Excel Config inicial',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint configuracion_salidas_horario_valido check (hora_fin > hora_inicio)
);

alter table public.configuracion_salidas enable row level security;

insert into public.configuracion_salidas (nivel_acceso, hora_inicio, hora_fin, puertas, fuente)
values
  ('Salida Estudiantes N-PP 1-5', '14:20', '15:10', array['Lector Biometrico Adm'], '2026-2027 Control Salida Hikcentral.xlsx / Config'),
  ('Salida Estudiantes N-PP 6-12', '14:20', '15:10', array['Door CS1','Door CS2','Door CS3'], '2026-2027 Control Salida Hikcentral.xlsx / Config'),
  ('Salida Estudiantes N-TR 1-12', '14:20', '15:10', array['Door CST1'], '2026-2027 Control Salida Hikcentral.xlsx / Config'),
  ('Salida Estudiantes E-PP 1-12', '16:00', '16:45', array['Door CS1','Door CS2','Door CS3'], '2026-2027 Control Salida Hikcentral.xlsx / Config'),
  ('Salida Estudiantes E-TR 1-12', '16:00', '16:45', array['Door CST1'], '2026-2027 Control Salida Hikcentral.xlsx / Config')
on conflict (nivel_acceso) do update set
  hora_inicio = excluded.hora_inicio,
  hora_fin = excluded.hora_fin,
  puertas = excluded.puertas,
  fuente = excluded.fuente,
  updated_at = now();

create table if not exists public.niveles_acceso_hikcentral (
  privilege_group_id text primary key,
  nombre text not null,
  descripcion text,
  hora_salida time,
  fuente_horario text,
  datos_originales jsonb not null default '{}'::jsonb,
  sincronizado_en timestamptz not null default now()
);

create table if not exists public.estudiante_niveles_acceso_hikcentral (
  id uuid primary key default gen_random_uuid(),
  estudiante_id uuid not null references public.estudiantes(id) on delete cascade,
  privilege_group_id text not null references public.niveles_acceso_hikcentral(privilege_group_id) on delete cascade,
  person_id_hik text,
  asignado_en timestamptz not null default now(),
  datos_originales jsonb not null default '{}'::jsonb,
  unique (estudiante_id, privilege_group_id)
);

create index if not exists idx_estudiante_niveles_estudiante
  on public.estudiante_niveles_acceso_hikcentral (estudiante_id);
create index if not exists idx_estudiante_niveles_grupo
  on public.estudiante_niveles_acceso_hikcentral (privilege_group_id);

alter table public.niveles_acceso_hikcentral enable row level security;
alter table public.estudiante_niveles_acceso_hikcentral enable row level security;
