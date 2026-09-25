-- Mito sync store.
--
-- Every synced entity (project, tag, task, time entry, time block) is one row: the client's
-- document as jsonb plus the fields sync needs. One table keeps the protocol simple — one
-- cursor, one realtime subscription — and lets the client evolve its documents without
-- server migrations.
--
-- Conflicts resolve last-write-wins on the client's `updated_at`. Deletions are tombstones
-- (`deleted_at`), never row deletes, so they reach every device.
--
-- `rev` is a server-assigned revision used as the pull cursor. Client clocks are never used
-- to decide what a device has seen.

create sequence public.records_rev_seq;

create table public.records (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  collection text not null check (collection in ('projects', 'tags', 'tasks', 'timeEntries', 'timeBlocks')),
  doc jsonb not null,
  -- Client timestamps, epoch milliseconds.
  updated_at bigint not null,
  deleted_at bigint,
  rev bigint not null default nextval('public.records_rev_seq')
);

create index records_user_rev on public.records (user_id, rev);

-- Every write gets a fresh revision, whoever makes it.
create function public.records_bump_rev() returns trigger
language plpgsql as $$
begin
  new.rev := nextval('public.records_rev_seq');
  return new;
end;
$$;

create trigger records_bump_rev
before insert or update on public.records
for each row execute function public.records_bump_rev();

-- Row-level security: a user sees and writes only their own rows.
alter table public.records enable row level security;

create policy "own rows: read" on public.records
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows: insert" on public.records
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows: update" on public.records
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Push: upsert a batch, keeping whichever version is newer (last write wins).
--
-- Writes of one user are serialized with an advisory lock, so their revisions are handed out
-- in commit order: a pull can never see revision N+1 committed while N is still in flight,
-- which would make the cursor skip N.
create function public.push_records(changes jsonb) returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

  insert into public.records as r (id, user_id, collection, doc, updated_at, deleted_at)
  select (c ->> 'id')::uuid,
         uid,
         c ->> 'collection',
         c -> 'doc',
         -- Via numeric: tolerate fractional milliseconds from any client.
         round((c ->> 'updatedAt')::numeric)::bigint,
         round((c ->> 'deletedAt')::numeric)::bigint
  from jsonb_array_elements(changes) as c
  on conflict (id) do update
    set doc = excluded.doc,
        collection = excluded.collection,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
    where r.user_id = uid and r.updated_at < excluded.updated_at;

  return coalesce((select max(rev) from public.records where user_id = uid), 0);
end;
$$;

grant execute on function public.push_records(jsonb) to authenticated;

-- Realtime: other devices hear about changes and pull.
alter publication supabase_realtime add table public.records;
