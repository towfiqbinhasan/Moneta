-- Moneta cloud sync schema. Run this in Supabase → SQL Editor.
-- One generic table holds every record type; row-level security keeps each
-- user's data private.

create table if not exists public.records (
  user_id    uuid    not null references auth.users (id) on delete cascade default auth.uid(),
  tbl        text    not null,
  id         text    not null,
  data       jsonb,
  updated_at bigint  not null,
  deleted    boolean not null default false,
  synced_at  timestamptz not null default now(),
  primary key (user_id, tbl, id)
);

create index if not exists records_user_synced on public.records (user_id, synced_at);

-- Server-side change clock: lets devices pull everything written since their
-- last pull, even edits made offline long ago and uploaded later.
create or replace function public.records_touch() returns trigger language plpgsql set search_path = '' as $$
begin
  -- Last write wins by the record's own clock: an older copy (e.g. a late echo from
  -- another device) must not overwrite a newer edit already on the server.
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.synced_at := now();
  return new;
end $$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.records_touch();

alter table public.records enable row level security;

-- Explicit API access for signed-in users only (works even when the project has
-- "Automatically expose new tables" turned off). RLS below still limits each
-- user to their own rows; anonymous visitors get nothing.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.records to authenticated;
revoke all on public.records from anon;

drop policy if exists "own records" on public.records;
create policy "own records" on public.records
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Realtime: lets other signed-in devices receive changes instantly.
do $$
begin
  alter publication supabase_realtime add table public.records;
exception when duplicate_object then null;
end $$;
