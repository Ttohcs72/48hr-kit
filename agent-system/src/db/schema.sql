-- Run this once in the Supabase SQL editor (or `supabase db push`) to set
-- up the schema. Everything the agent team reads or writes lives here.

create table if not exists businesses (
  slug text primary key,
  name text not null,
  website_url text not null,
  tagline text,
  brand_voice text,
  target_audience text,
  value_proposition text,
  offers jsonb not null default '[]',
  real_claims jsonb not null default '[]',
  primary_cta_url text,
  banned_topics jsonb not null default '[]',
  extracted_at timestamptz not null default now()
);

create table if not exists content_pillars (
  id uuid primary key default gen_random_uuid(),
  business_slug text not null references businesses(slug) on delete cascade,
  name text not null,
  description text,
  weight int not null default 5,
  created_at timestamptz not null default now(),
  unique (business_slug, name)
);

create table if not exists calendar_entries (
  id uuid primary key default gen_random_uuid(),
  business_slug text not null references businesses(slug) on delete cascade,
  platform text not null,
  pillar_name text not null,
  topic text not null,
  scheduled_at timestamptz not null,
  status text not null default 'planned', -- planned | generated
  created_at timestamptz not null default now()
);

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  calendar_entry_id uuid references calendar_entries(id) on delete set null,
  business_slug text not null references businesses(slug) on delete cascade,
  platform text not null,
  content text not null,
  hashtags jsonb not null default '[]',
  cta_url text,
  media_brief text,
  media_url text,
  media_type text, -- image | video, meaningful once media_url is set
  status text not null default 'draft',
  -- draft | needs_revision | needs_human_review | approved | published | failed | rejected
  scheduled_at timestamptz not null,
  revision_count int not null default 0,
  brand_guardian_score int,
  brand_guardian_notes text,
  platform_post_id text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists posts_status_scheduled_idx on posts (status, scheduled_at);

create table if not exists verification_log (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  approved boolean not null,
  score int not null,
  issues jsonb not null default '[]',
  revision_instructions text,
  needs_human_review boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists publish_log (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  platform text not null,
  status text not null, -- success | failed
  platform_post_id text,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  platform text not null,
  impressions int not null default 0,
  likes int not null default 0,
  comments int not null default 0,
  shares int not null default 0,
  clicks int not null default 0,
  captured_at timestamptz not null default now()
);

-- Where the feedback loop lives: the Analytics agent writes takeaways here,
-- and the Strategist agent reads the most recent ones before planning the
-- next batch of content, so the system gets better at its own job over time.
create table if not exists learnings (
  id uuid primary key default gen_random_uuid(),
  business_slug text not null references businesses(slug) on delete cascade,
  insight text not null,
  supporting_data jsonb,
  created_at timestamptz not null default now()
);

-- ── Row Level Security ─────────────────────────────────────────────────
-- The GitHub Actions jobs use the SERVICE ROLE key, which bypasses RLS
-- entirely, so the policies below only govern what dashboard.html (using
-- the public ANON key, visible in browser source) is allowed to touch.
-- This is intentionally read-mostly: humans can review and change a post's
-- status, nothing else, and never anything on other tables.

alter table posts enable row level security;
alter table businesses enable row level security;
alter table analytics_snapshots enable row level security;
alter table verification_log enable row level security;

create policy "anon can read posts" on posts for select using (true);
create policy "anon can only update status of posts" on posts for update using (true) with check (true);
create policy "anon can read businesses" on businesses for select using (true);
create policy "anon can read analytics" on analytics_snapshots for select using (true);
create policy "anon can read verification log" on verification_log for select using (true);

-- Note: Postgres RLS can't restrict *which columns* an UPDATE touches, only
-- which rows. dashboard.html is trusted client code we wrote to only ever
-- send {status: ...}, but if you want a hard server-side guarantee, add a
-- Postgres trigger that rejects updates changing any column other than
-- `status`. Left as a next step in README.md.

-- ── Migration: media_type column (added for video support) ────────────
-- If you ran this file before the video content agent existed, re-running
-- the whole file is safe - every `create table` above is already
-- `if not exists`, and this line adds only the new column, skipping
-- cleanly if it's already there.
alter table posts add column if not exists media_type text;
