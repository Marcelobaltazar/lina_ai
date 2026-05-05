-- Lina.AI — Initial Schema
-- All tables follow mandatory prefix convention:
-- cus_ customers | sub_ subscriptions | msg_ messages | med_ medications
-- fam_ family | alr_ alerts | cfg_ config | adm_ admin

-- Customers
create table if not exists cus_customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  whatsapp    text not null unique,
  birth_date  date,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Subscriptions
create table if not exists sub_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references cus_customers(id) on delete cascade,
  stripe_sub_id   text,
  plan            text not null default 'basic',
  status          text not null default 'active',
  expires_at      timestamptz,
  created_at      timestamptz not null default now()
);

-- Messages
create table if not exists msg_messages (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references cus_customers(id) on delete cascade,
  direction     text not null check (direction in ('in', 'out')),
  content       text not null,
  sentiment     text,
  created_at    timestamptz not null default now()
);

-- Medication reminders
create table if not exists med_reminders (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid not null references cus_customers(id) on delete cascade,
  whatsapp          text not null,
  medication_name   text not null,
  schedule_cron     text not null,
  next_at           timestamptz,
  last_sent_at      timestamptz,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

-- Family contacts
create table if not exists fam_contacts (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references cus_customers(id) on delete cascade,
  name          text not null,
  email         text,
  whatsapp      text,
  created_at    timestamptz not null default now()
);

-- Alerts log
create table if not exists alr_alerts (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid references cus_customers(id) on delete set null,
  flag          text not null,
  message       text,
  notified_at   timestamptz not null default now()
);

-- LLM / system config
create table if not exists cfg_settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

insert into cfg_settings (key, value) values
  ('llm_provider', 'claude'),
  ('llm_model', 'claude-sonnet-4-6')
on conflict (key) do nothing;

-- Admin users
create table if not exists adm_users (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  role        text not null default 'viewer',
  created_at  timestamptz not null default now()
);
