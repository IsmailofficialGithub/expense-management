-- Super admin panel: request audit log, outbound email/WhatsApp log, system settings, report/phone prefs.
create table audit_logs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  actor_id uuid,
  actor_email text,
  is_admin boolean not null default false,
  method text not null,
  route text,
  url text not null,
  status int,
  ip text,
  duration_ms int,
  message text,
  request jsonb,
  response jsonb,
  error text
);
create index audit_logs_created_at_idx on audit_logs (created_at desc);
create index audit_logs_actor_id_idx on audit_logs (actor_id);
create index audit_logs_route_idx on audit_logs (route);

create table outbound_messages (
  id bigserial primary key,
  channel text not null check (channel in ('email', 'whatsapp')),
  to_addr text not null,
  subject text,
  body text not null,
  kind text not null,
  user_id uuid references users(id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index outbound_messages_created_at_idx on outbound_messages (created_at desc);
create index outbound_messages_status_idx on outbound_messages (status);

create table system_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table profiles
  add column phone_e164 text,
  add column phone_needs_country boolean not null default false,
  add column report_daily boolean not null default true,
  add column report_weekly boolean not null default true,
  add column whatsapp_opt_in boolean not null default true;

-- '+' numbers are already international: keep digits only. Anything else lacks a country code.
update profiles set phone_e164 = '+' || regexp_replace(phone, '\D', '', 'g')
 where phone ~ '^\s*\+' and length(regexp_replace(phone, '\D', '', 'g')) between 7 and 15;
update profiles set phone_needs_country = true
 where coalesce(trim(phone), '') <> '' and phone_e164 is null;

alter table messages add column admin_action text check (admin_action in ('sent', 'edited'));
