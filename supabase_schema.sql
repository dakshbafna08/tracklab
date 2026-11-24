-- =========================================================================
-- TrackLab // Supabase database schema
-- =========================================================================
-- Matches the live Supabase project as of November 23, 2026.
--
-- This file is a RECIPE for the database structure: tables, links,
-- rules, security policies, and the sign-up trigger. It does NOT
-- contain any data. Track and tyre data come from running add_tracks.py.
--
-- Committing or editing this file does not change the live database.
-- Only run it in the Supabase SQL Editor to rebuild the database from
-- scratch (for example, in a new or test project).
--
-- Never store secret keys or passwords in this file.
-- =========================================================================


-- =========================================================================
-- 1. PROFILES: one row per user, linked to their Supabase Auth account.
--    Emails and passwords live in auth.users (managed by Supabase Auth).
-- =========================================================================
create table if not exists public.profiles (
  id                   uuid primary key
                       references auth.users(id) on update cascade on delete cascade,
  username             text not null default '' unique,
  join_time            timestamptz not null default now(),
  preferred_mode       text default 'guided',
  has_completed_guide  boolean not null default false
);

comment on table public.profiles is 'stores profile information for each user';

alter table public.profiles enable row level security;

drop policy if exists "Enable read access for all users" on public.profiles;
create policy "Enable read access for all users"
  on public.profiles for select
  using (true);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);


-- =========================================================================
-- 2. TRACKS: fixed facts about each F1 circuit (from 2022 race data).
-- =========================================================================
create table if not exists public.tracks (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null unique,     -- name shown in the app, e.g. 'Melbourne'
  fastf1_event         text,                     -- FastF1 event name, e.g. 'Australian Grand Prix'
  total_laps           integer,
  pit_loss_seconds     numeric,                  -- time lost per pit stop
  centerline_file      text,                     -- TUM track shape file, e.g. data/tracks/Melbourne.csv
  fuel_effect_per_lap  numeric                   -- seconds gained per lap as fuel burns (negative)
);

alter table public.tracks enable row level security;

drop policy if exists "Enable read access for all users" on public.tracks;
create policy "Enable read access for all users"
  on public.tracks for select
  using (true);


-- =========================================================================
-- 3. TYRE DEGRADATION: tyre wear per track and compound.
--    lap time = base_lap_seconds + seconds_lost_per_lap * tyre age
--               + fuel_effect_per_lap * lap number
-- =========================================================================
create table if not exists public.tyre_degradation (
  id                    uuid primary key default gen_random_uuid(),
  track_id              uuid not null
                        references public.tracks(id) on update cascade on delete cascade,
  compound              text not null,
  base_lap_seconds      numeric not null,        -- lap time on brand-new tyres (full fuel)
  seconds_lost_per_lap  numeric not null,        -- extra time per lap of tyre age
  constraint valid_compound
    check (compound in ('SOFT','MEDIUM','HARD','INTERMEDIATE','WET')),
  constraint one_row_per_track_compound
    unique (track_id, compound)
);

alter table public.tyre_degradation enable row level security;

drop policy if exists "Enable read access for all users" on public.tyre_degradation;
create policy "Enable read access for all users"
  on public.tyre_degradation for select
  using (true);


-- =========================================================================
-- 4. MODELS: trained RL model versions. The model files themselves live
--    in the private Supabase Storage bucket 'models'.
-- =========================================================================
create table if not exists public.models (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                     -- e.g. 'ppo_strategy'
  version     text not null,                     -- e.g. 'v1'
  track_id    uuid references public.tracks(id) on update cascade,  -- null = any track
  file_path   text not null,                     -- file name inside the 'models' bucket
  format      text not null default 'onnx',
  is_active   boolean not null default false,    -- the version the backend loads
  notes       text,
  created_at  timestamptz not null default now(),
  constraint valid_format check (format in ('onnx', 'sb3_zip')),
  constraint unique_name_version unique (name, version)
);

-- Only one model can be active at a time
create unique index if not exists only_one_active_model
  on public.models (is_active) where is_active;

alter table public.models enable row level security;

drop policy if exists "Logged-in users can view models" on public.models;
create policy "Logged-in users can view models"
  on public.models for select
  to authenticated
  using (true);


-- =========================================================================
-- 5. STRATEGIES: one row per strategy a user saves (or the AI creates).
-- =========================================================================
create table if not exists public.strategies (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null
                       references public.profiles(id) on update cascade on delete cascade,
  track_id             uuid not null
                       references public.tracks(id) on update cascade,
  name                 text not null default 'Untitled strategy',
  starting_compound    text not null,
  starting_fuel_kg     numeric,
  created_at           timestamptz not null default now(),
  created_by_model_id  uuid references public.models(id),   -- null = made by the user
  constraint valid_starting_compound
    check (starting_compound in ('SOFT','MEDIUM','HARD','INTERMEDIATE','WET'))
);

alter table public.strategies enable row level security;

drop policy if exists "Users manage their own strategies" on public.strategies;
create policy "Users manage their own strategies"
  on public.strategies for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);


-- =========================================================================
-- 6. PIT STOPS: one row per stop inside a strategy.
-- =========================================================================
create table if not exists public.pit_stops (
  id            uuid primary key default gen_random_uuid(),
  strategy_id   uuid not null
                references public.strategies(id) on update cascade on delete cascade,
  stop_number   integer not null,
  lap           integer not null,
  new_compound  text not null,
  constraint positive_stop_number check (stop_number > 0),
  constraint positive_lap check (lap > 0),
  constraint valid_new_compound
    check (new_compound in ('SOFT','MEDIUM','HARD','INTERMEDIATE','WET')),
  constraint one_row_per_stop unique (strategy_id, stop_number)
);

alter table public.pit_stops enable row level security;

drop policy if exists "Users manage pit stops on their own strategies" on public.pit_stops;
create policy "Users manage pit stops on their own strategies"
  on public.pit_stops for all
  to authenticated
  using (exists (select 1 from public.strategies s
                 where s.id = strategy_id and s.user_id = (select auth.uid())))
  with check (exists (select 1 from public.strategies s
                      where s.id = strategy_id and s.user_id = (select auth.uid())));


-- =========================================================================
-- 7. SIMULATION RESULTS: one row per simulation run.
--    Written only by the backend API (using the secret key, which skips
--    these policies). Users can read results for their own strategies.
-- =========================================================================
create table if not exists public.simulation_results (
  id                  uuid primary key default gen_random_uuid(),
  strategy_id         uuid not null
                      references public.strategies(id) on update cascade on delete cascade,
  model_id            uuid references public.models(id) on update cascade,  -- null = simple formula
  total_time_seconds  numeric not null,
  created_at          timestamptz not null default now()
);

alter table public.simulation_results enable row level security;

drop policy if exists "Users can view results of their own strategies" on public.simulation_results;
create policy "Users can view results of their own strategies"
  on public.simulation_results for select
  to authenticated
  using (exists (select 1 from public.strategies s
                 where s.id = strategy_id and s.user_id = (select auth.uid())));


-- =========================================================================
-- 8. SIGN-UP TRIGGER: creates a profile automatically when a user signs up.
--    Sign-up must pass the username:
--    supabase.auth.signUp({ email, password, options: { data: { username } } })
-- =========================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data ->> 'username');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only the trigger should run this function, not users through the API
revoke execute on function public.handle_new_user() from anon, authenticated, public;


-- =========================================================================
-- 9. AUTOMATIC RLS: turns on Row Level Security for every new table in
--    'public', so no table is ever accidentally left open.
--    (Created by the "Enable automatic RLS" option when the project was set up.)
-- =========================================================================
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer set search_path = 'pg_catalog'
as $$
declare
  cmd record;
  tbl name;
begin
  for cmd in
    select * from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name = 'public' then
      begin
        select c.relname into tbl from pg_catalog.pg_class c where c.oid = cmd.objid;
        execute format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
      exception when others then
        raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
    end if;
  end loop;
end;
$$;

drop event trigger if exists ensure_rls;
create event trigger ensure_rls
  on ddl_command_end
  execute function public.rls_auto_enable();

revoke execute on function public.rls_auto_enable() from anon, authenticated, public;


-- =========================================================================
-- 10. STORAGE (set up in the dashboard, not in SQL):
--     Storage -> New bucket -> name 'models', Public bucket OFF.
--     The backend downloads the active model file from it at startup.
-- =========================================================================
