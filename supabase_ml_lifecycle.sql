-- Additive. Apply only after approval. Server/worker service role only.
begin;
create table if not exists public.ml_lifecycle (
  id text primary key,
  revision bigint not null default 0,
  payload jsonb not null default '{}'::jsonb
);
alter table public.ml_lifecycle enable row level security;
revoke all on public.ml_lifecycle from anon, authenticated;
grant select, insert, update on public.ml_lifecycle to service_role;
insert into public.ml_lifecycle(id) values ('main') on conflict do nothing;
commit;
