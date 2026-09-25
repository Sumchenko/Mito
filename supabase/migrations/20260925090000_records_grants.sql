-- Explicit privileges for the sync table.
--
-- Hosted projects can be created with "automatically expose new tables" switched off, in which
-- case tables get no default grants. Mito never relies on defaults: signed-in users may read
-- and write (row-level security still limits them to their own rows); anonymous visitors get
-- nothing, and nobody can hard-delete (deletions are tombstones).

revoke all on public.records from anon, authenticated;
grant select, insert, update on public.records to authenticated;
grant usage on sequence public.records_rev_seq to authenticated;

revoke all on function public.push_records(jsonb) from public, anon;
grant execute on function public.push_records(jsonb) to authenticated;

revoke all on function public.records_bump_rev() from public, anon, authenticated;
