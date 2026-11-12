create table if not exists public.app_sessions (
  token_hash text primary key check (length(token_hash) = 64),
  user_data jsonb not null,
  created_at timestamptz not null default now(),
  last_activity timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists app_sessions_expires_at_idx
  on public.app_sessions (expires_at);

alter table public.app_sessions enable row level security;
revoke all on table public.app_sessions from anon, authenticated;
grant all on table public.app_sessions to service_role;
