-- Stage 8: learning goals and the mentor's notes sync like everything else. Documents live in
-- the same `records` table; only the list of allowed collections grows.

alter table public.records drop constraint records_collection_check;
alter table public.records add constraint records_collection_check check (
  collection in ('projects', 'tags', 'tasks', 'timeEntries', 'timeBlocks', 'goals', 'mentorNotes')
);
