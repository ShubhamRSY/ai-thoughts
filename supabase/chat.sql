-- ============================================================
-- AI·Thoughts — Chat ("talk") schema / Realtime
--
-- Run this in the Supabase SQL editor AFTER schema.sql.
-- Adds per-take comments so people can talk about a take in
-- real time, streamed to everyone via Supabase Realtime.
--
-- Chat here is open like the pulse: anyone may read/write a
-- message on any take. Keepers can remove messages via the same
-- `is_keeper()` gate used for reports/posts.
-- ============================================================

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete set null,
  handle      text not null,
  author      text not null default '',
  body        text not null check (char_length(trim(body)) > 0),
  created_at  timestamptz not null default now()
);

create index if not exists messages_post_idx
  on public.messages (post_id, created_at asc);

alter table public.messages enable row level security;

-- Open like the pulse: anyone can read and post a message.
create policy "public read messages" on public.messages
  for select using (true);
create policy "public insert messages" on public.messages
  for insert with check (true);

-- Owners may delete their own messages; keepers may delete any.
create policy "own messages delete" on public.messages
  for delete using (auth.uid() = user_id);
create policy "keepers delete messages" on public.messages
  for delete using (public.is_keeper());

-- Stream messages to every connected client via Realtime.
alter publication supabase_realtime add table public.messages;
