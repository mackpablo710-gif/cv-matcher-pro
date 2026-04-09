-- CV Matcher Pro - Run this in Supabase SQL Editor
-- https://supabase.com/dashboard/project/ezkrlqzqtyslrbgejaok/sql/new

create table if not exists public.master_cvs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  file_name text,
  content text not null,
  created_at timestamptz default now()
);

create table if not exists public.adaptations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  job_title text,
  job_description text,
  cv_text text,
  language text default 'Español',
  initial_match jsonb,
  initial_score integer default 0,
  final_score integer default 0,
  adapted_content jsonb,
  analysis jsonb,
  created_at timestamptz default now()
);

alter table public.master_cvs enable row level security;
alter table public.adaptations enable row level security;

create policy view_master_cvs on public.master_cvs for select using (auth.uid() = user_id);
create policy insert_master_cvs on public.master_cvs for insert with check (auth.uid() = user_id);
create policy delete_master_cvs on public.master_cvs for delete using (auth.uid() = user_id);
create policy view_adaptations on public.adaptations for select using (auth.uid() = user_id);
create policy insert_adaptations on public.adaptations for insert with check (auth.uid() = user_id);
create policy update_adaptations on public.adaptations for update using (auth.uid() = user_id);
