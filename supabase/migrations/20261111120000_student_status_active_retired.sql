-- Convertir el estado booleano heredado al catálogo A/R.
alter table public.estudiantes
  alter column estado drop default;

alter table public.estudiantes
  alter column estado type text
  using case when estado is true then 'A' else 'R' end;

update public.estudiantes set estado = 'A' where estado is null;

alter table public.estudiantes
  alter column estado set default 'A',
  alter column estado set not null;

alter table public.estudiantes
  add constraint estudiantes_estado_check check (estado in ('A', 'R'));
