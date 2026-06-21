-- Narc tables — run once in Supabase SQL editor
-- https://supabase.com/dashboard/project/qtgwfcqqlgazzxxrqyts/sql/new

create table if not exists narc_decisions (
  id       text    primary key,
  ts       bigint  not null,
  agent_id text    not null,
  tick     int     not null,
  data     jsonb   not null
);

create table if not exists narc_outcomes (
  id       text    primary key,
  ts       bigint  not null,
  agent_id text    not null,
  tick     int     not null,
  data     jsonb   not null
);

create table if not exists narc_findings (
  id          text    primary key,
  ts          bigint  not null,
  auditor_id  text    not null,
  tick        int     not null,
  verdict     text    not null,
  data        jsonb   not null
);

create table if not exists narc_mandates (
  agent_id text    primary key,
  ts       bigint  not null,
  data     jsonb   not null
);

-- Expose tables to the Data API (PostgREST)
grant select on narc_decisions to anon, authenticated;
grant select on narc_outcomes  to anon, authenticated;
grant select on narc_findings  to anon, authenticated;
grant select on narc_mandates  to anon, authenticated;

grant insert, update on narc_decisions to service_role;
grant insert, update on narc_outcomes  to service_role;
grant insert, update on narc_findings  to service_role;
grant insert, update on narc_mandates  to service_role;

-- RLS: public read, service_role writes (bypasses RLS by default)
alter table narc_decisions enable row level security;
alter table narc_outcomes  enable row level security;
alter table narc_findings  enable row level security;
alter table narc_mandates  enable row level security;

create policy "public read" on narc_decisions for select to anon, authenticated using (true);
create policy "public read" on narc_outcomes  for select to anon, authenticated using (true);
create policy "public read" on narc_findings  for select to anon, authenticated using (true);
create policy "public read" on narc_mandates  for select to anon, authenticated using (true);
