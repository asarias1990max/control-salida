-- Snapshot diario de la información sincronizada desde HikCentral y las reglas de salida.
-- Una fila por día; si la sincronización se repite, actualiza el snapshot de ese mismo día.
create table if not exists public.historial_diario_hikcentral (
  fecha_snapshot date primary key,
  niveles_acceso jsonb not null default '[]'::jsonb,
  asignaciones_estudiantes jsonb not null default '[]'::jsonb,
  referencias_horario jsonb not null default '[]'::jsonb,
  configuracion_salidas jsonb not null default '[]'::jsonb,
  total_niveles integer not null default 0,
  total_asignaciones integer not null default 0,
  total_horarios integer not null default 0,
  sincronizado_en timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_historial_diario_hikcentral_fecha
  on public.historial_diario_hikcentral (fecha_snapshot desc);
alter table public.historial_diario_hikcentral enable row level security;
