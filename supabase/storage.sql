-- ============================================================
-- AI·Thoughts — Storage setup / policies for the public "takes" bucket.
--
-- Run this in the Supabase SQL editor AFTER the main schema.sql.
-- Make sure the "takes" bucket exists in Storage first (or this
-- creates it). This opens uploads to everyone (open, raw pulse —
-- anyone can drop a voice/video take) and keeps them publicly readable.
-- ============================================================

-- Public bucket for raw takes (video/audio clips)
insert into storage.buckets (id, name, public)
values ('takes', 'takes', true)
on conflict (id) do update set public = true;

-- Anyone may upload a take (anon + signed-in)
create policy "takes public insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'takes');

-- Anyone may read takes (anon + signed-in)
create policy "takes public select"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'takes');

-- A signed-in owner can delete their own uploads
create policy "takes owner delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'takes' and owner_id = auth.uid());