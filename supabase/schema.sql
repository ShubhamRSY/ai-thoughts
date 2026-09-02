-- ============================================================
-- AI·Thoughts — "The Public Pulse" schema (PostgreSQL / Supabase)
--
-- The pulse is PUBLIC: everyone can read, and anyone can drop a
-- take. Signing in (optional) lets you claim your handle and edit
-- your own posts / reactions.
--
-- Create this in the Supabase SQL editor after creating the project.
-- ============================================================

-- Profiles — only used when someone actually signs in.
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  handle      text unique,
  author      text,
  created_at  timestamptz not null default now()
);

-- Posts (takes)
create table if not exists public.posts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users (id) on delete set null,
  handle            text not null,
  author            text not null default '',
  content           text not null,
  media_type        text not null check (media_type in ('audio', 'video', 'text')),
  feeling           text,
  media_url         text,
  media_duration    text,
  tags              text[] not null default '{}',
  language          text,
  language_label    text,
  integrity_hash    text,
  integrity_verified boolean not null default false,
  integrity_label   text,
  transcript        jsonb,
  boosts            integer not null default 0,
  created_at        timestamptz not null default now()
);

-- Reactions ("people feel this too")
create table if not exists public.post_reactions (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete set null,
  reaction    text not null,
  created_at  timestamptz not null default now(),
  unique (post_id, user_id, reaction)
);

create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists post_reactions_post_idx on public.post_reactions (post_id);

-- Row level security
alter table public.profiles       enable row level security;
alter table public.posts          enable row level security;
alter table public.post_reactions enable row level security;

-- The pulse is public
create policy "public read posts"     on public.posts          for select using (true);
create policy "public read profiles"  on public.profiles       for select using (true);
create policy "public read reactions" on public.post_reactions for select using (true);

-- Anyone can drop a take or a reaction (open, raw, all-ages pulse)
create policy "public insert posts"     on public.posts          for insert with check (true);
create policy "public insert reactions" on public.post_reactions for insert with check (true);

-- Signed-in owners manage their own content
create policy "own posts update"    on public.posts          for update using (auth.uid() = user_id);
create policy "own posts delete"    on public.posts          for delete using (auth.uid() = user_id);
create policy "own reactions delete" on public.post_reactions for delete using (auth.uid() = user_id);
create policy "own profile update"  on public.profiles       for update using (auth.uid() = id);
create policy "own profile insert"  on public.profiles       for insert with check (auth.uid() = id);

-- ------------------------------------------------------------
-- Reports — the all-ages safety net.
--   Anyone can report a take; community keepers review reports.
--   Reports are written but never shown to the public.
-- ------------------------------------------------------------
create table if not exists public.reports (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references public.posts (id) on delete cascade,
  reporter_id     uuid references auth.users (id) on delete set null,
  reason          text not null,
  reported_handle text,
  content_snippet text,
  status          text not null default 'open'
    check (status in ('open', 'resolved')),
  created_at      timestamptz not null default now()
);

alter table public.reports enable row level security;

-- Anyone (anon or signed-in) can submit a report
create policy "public insert reports" on public.reports for insert with check (true);
-- Keepers read & resolve reports. A keeper is any signed-in user listed in
-- the `keepers` table. Reports are never shown to the public.
create or replace function public.is_keeper()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.keepers where user_id = auth.uid()
  );
$$;
create policy "keepers read reports" on public.reports
  for select using (public.is_keeper());
create policy "keepers update reports" on public.reports
  for update using (public.is_keeper());
-- Keepers may hide any post and delete it
create policy "keepers delete posts" on public.posts
  for delete using (public.is_keeper());

-- ------------------------------------------------------------
-- Keepers — the people who keep the pulse safe.
--   Anyone can apply; an existing keeper (or you, via SQL) grants the role.
-- ------------------------------------------------------------
create table if not exists public.keepers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id)
);

alter table public.keepers enable row level security;

-- A keeper may read the keeper list; only existing keepers may add new ones.
create policy "keepers read keepers" on public.keepers
  for select using (public.is_keeper());
create policy "keepers insert keepers" on public.keepers
  for insert with check (public.is_keeper());