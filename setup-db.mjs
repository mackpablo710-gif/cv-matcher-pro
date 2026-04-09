// Run once: node setup-db.mjs
// Creates the required tables in Supabase via direct PostgreSQL connection

import pg from 'pg';
const { Client } = pg;

const client = new Client({
  host: 'db.ezkrlqzqtyslrbgejaok.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: '55lex9Ba5BlRubiB',
  ssl: { rejectUnauthorized: false },
});

const sql = `
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

do $$ begin
  if not exists (select 1 from pg_policies where tablename='master_cvs' and policyname='view_master_cvs') then
    create policy view_master_cvs on public.master_cvs for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='master_cvs' and policyname='insert_master_cvs') then
    create policy insert_master_cvs on public.master_cvs for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='master_cvs' and policyname='delete_master_cvs') then
    create policy delete_master_cvs on public.master_cvs for delete using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='adaptations' and policyname='view_adaptations') then
    create policy view_adaptations on public.adaptations for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='adaptations' and policyname='insert_adaptations') then
    create policy insert_adaptations on public.adaptations for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='adaptations' and policyname='update_adaptations') then
    create policy update_adaptations on public.adaptations for update using (auth.uid() = user_id);
  end if;
end $$;
`;

async function main() {
  console.log('🔧 Connecting to Supabase PostgreSQL...');
  await client.connect();
  console.log('✅ Connected!');
  await client.query(sql);
  console.log('✅ Tables and policies created!');
  await client.end();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
