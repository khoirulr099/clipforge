-- Run this in your Supabase SQL editor

-- Jobs table
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  video_title text,
  video_duration int,
  status text default 'queued',
  progress int default 0,
  provider text default 'gemini',
  transcript text,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Clips table
create table if not exists clips (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  clip_index int,
  title text,
  hook text,
  reason text,
  score int,
  start_time float,
  end_time float,
  duration float,
  clip_url text,
  srt_url text,
  created_at timestamptz default now()
);

-- Storage bucket (create via dashboard or CLI)
-- Name: clipforge-videos
-- Public: true (for direct URL access)

-- Enable RLS (adjust policies as needed)
alter table jobs enable row level security;
alter table clips enable row level security;

-- Allow service role full access (used by FastAPI)
create policy "Service role full access jobs" on jobs
  for all using (auth.role() = 'service_role');

create policy "Service role full access clips" on clips
  for all using (auth.role() = 'service_role');
