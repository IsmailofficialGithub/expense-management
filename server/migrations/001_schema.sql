-- Rebuilt from src/types/database.types.ts + app queries (no Supabase dump available).
create extension if not exists pgcrypto;

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  email_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references users(id) on delete cascade,
  email text not null unique,
  full_name text,
  avatar_url text,
  phone text,
  push_token text,
  push_token_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('admin','member')),
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create table group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  invited_by uuid not null references profiles(id),
  invited_email text not null,
  invitation_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'pending' check (status in ('pending','accepted','expired')),
  auto_created_user_id uuid references profiles(id),
  temporary_password text,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text not null,
  color text not null,
  is_default boolean not null default true
);

create table hotels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  phone text,
  is_active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table hotel_menu_items (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  item_name text not null,
  category text not null,
  price numeric(12,2) not null,
  description text,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  method_type text not null check (method_type in ('cash','bank','jazzcash','easypaisa','card','other')),
  is_default boolean not null default false,
  bank_name text, account_title text, account_number text, iban text,
  phone_number text, card_last_four text, custom_name text, notes text,
  is_visible_to_groups boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  category_id uuid references expense_categories(id),
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  paid_by uuid not null references profiles(id),
  date date not null default current_date,
  notes text,
  receipt_url text,
  split_type text not null default 'equal' check (split_type in ('equal','unequal','percentage','shares')),
  payment_method_id uuid references user_payment_methods(id) on delete set null,
  payment_method_type text,
  hotel_id uuid references hotels(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on expenses (group_id, date desc);

create table expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  user_id uuid not null references profiles(id),
  amount numeric(12,2) not null,
  percentage numeric(6,2),
  shares numeric(10,2),
  is_settled boolean not null default false,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (expense_id, user_id)
);
create index on expense_splits (user_id);

create table expense_food_items (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  hotel_id uuid references hotels(id) on delete set null,
  menu_item_id uuid references hotel_menu_items(id) on delete set null,
  item_name text not null,
  quantity integer not null default 1,
  unit_price numeric(12,2) not null,
  total_price numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create table settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  from_user uuid not null references profiles(id),
  to_user uuid not null references profiles(id),
  amount numeric(12,2) not null check (amount > 0),
  settled_at timestamptz not null default now(),
  notes text,
  related_expense_ids uuid[],
  is_bulk boolean not null default false,
  bulk_settlement_id uuid,
  created_at timestamptz not null default now()
);
create index on settlements (group_id);

create table group_advance_collections (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  recipient_id uuid not null references profiles(id),
  total_amount numeric(12,2) not null,
  per_member_amount numeric(12,2),
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  description text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table advance_collection_contributions (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references group_advance_collections(id) on delete cascade,
  user_id uuid not null references profiles(id),
  amount numeric(12,2) not null,
  status text not null default 'pending' check (status in ('pending','pending_approval','paid','cancelled')),
  contributed_at timestamptz,
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create table personal_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('income','expense')),
  icon text not null,
  color text not null,
  is_default boolean not null default true
);

create table personal_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('income','expense')),
  category text not null,
  amount numeric(12,2) not null check (amount >= 0),
  description text not null,
  date date not null default current_date,
  notes text,
  receipt_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on personal_transactions (user_id, date desc);

create table personal_debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  creditor_id uuid not null references profiles(id),
  amount numeric(12,2) not null,
  description text not null,
  due_date date,
  is_settled boolean not null default false,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null,
  is_read boolean not null default false,
  related_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index on notifications (user_id, created_at desc);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('group','individual')),
  group_id uuid unique references groups(id) on delete cascade,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_message_text text,
  last_message_sender_id uuid references profiles(id)
);

create table conversation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  is_muted boolean not null default false,
  unique (conversation_id, user_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  text text not null default '',
  message_type text not null default 'text' check (message_type in ('text','image','file','expense')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_edited boolean not null default false,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  related_expense_id uuid references expenses(id) on delete set null,
  media_url text,
  media_type text
);
create index on messages (conversation_id, created_at desc);

create table message_reads (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  unique (message_id, user_id)
);

create table message_deletions (
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  deleted_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table typing_indicators (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  is_typing boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (conversation_id, user_id)
);

-- Keep conversations' last-message preview current
create function bump_conversation() returns trigger language plpgsql as $$
begin
  update conversations set last_message_at = new.created_at, last_message_text = new.text,
         last_message_sender_id = new.sender_id, updated_at = now()
   where id = new.conversation_id;
  return new;
end $$;
create trigger messages_bump after insert on messages for each row execute function bump_conversation();

-- balance > 0: group owes this user. Settlements paid count as paid; received count as owed.
create view user_group_balances as
select gm.group_id, gm.user_id,
  coalesce(p.paid, 0) + coalesce(s_out.amt, 0) as total_paid,
  coalesce(o.owed, 0) + coalesce(s_in.amt, 0) as total_owed,
  coalesce(p.paid, 0) + coalesce(s_out.amt, 0) - coalesce(o.owed, 0) - coalesce(s_in.amt, 0) as balance
from group_members gm
left join (select group_id, paid_by, sum(amount) paid from expenses group by 1, 2) p
  on p.group_id = gm.group_id and p.paid_by = gm.user_id
left join (select e.group_id, s.user_id, sum(s.amount) owed from expense_splits s join expenses e on e.id = s.expense_id group by 1, 2) o
  on o.group_id = gm.group_id and o.user_id = gm.user_id
left join (select group_id, from_user, sum(amount) amt from settlements group by 1, 2) s_out
  on s_out.group_id = gm.group_id and s_out.from_user = gm.user_id
left join (select group_id, to_user, sum(amount) amt from settlements group by 1, 2) s_in
  on s_in.group_id = gm.group_id and s_in.to_user = gm.user_id;

create view user_complete_balance as
select pr.id as user_id,
  coalesce((select sum(amount) from personal_transactions where user_id = pr.id and type = 'income'), 0) as total_income,
  coalesce((select sum(amount) from personal_transactions where user_id = pr.id and type = 'expense'), 0) as total_personal_expenses,
  coalesce((select sum(amount) from expenses where paid_by = pr.id), 0) as total_group_paid,
  coalesce((select sum(s.amount) from expense_splits s join expenses e on e.id = s.expense_id
            where s.user_id = pr.id and e.paid_by <> pr.id and not s.is_settled), 0) as total_group_owe,
  coalesce((select sum(s.amount) from expense_splits s join expenses e on e.id = s.expense_id
            where e.paid_by = pr.id and s.user_id <> pr.id and not s.is_settled), 0) as total_group_owed_to_them,
  coalesce((select sum(case when type = 'income' then amount else -amount end) from personal_transactions where user_id = pr.id), 0)
    - coalesce((select sum(s.amount) from expense_splits s join expenses e on e.id = s.expense_id
                where s.user_id = pr.id and e.paid_by <> pr.id and not s.is_settled), 0)
    + coalesce((select sum(s.amount) from expense_splits s join expenses e on e.id = s.expense_id
                where e.paid_by = pr.id and s.user_id <> pr.id and not s.is_settled), 0) as net_balance
from profiles pr;

insert into expense_categories (name, icon, color) values
  ('Food', 'food', '#FF6B6B'), ('Groceries', 'cart', '#4ECDC4'), ('Rent', 'home', '#45B7D1'),
  ('Utilities', 'flash', '#F7B731'), ('Transport', 'car', '#5F27CD'), ('Entertainment', 'movie', '#EE5A6F'),
  ('Shopping', 'shopping', '#26DE81'), ('Other', 'dots-horizontal', '#95A5A6');

insert into personal_categories (name, type, icon, color) values
  ('Salary', 'income', 'cash', '#26DE81'), ('Freelance', 'income', 'laptop', '#4ECDC4'), ('Other Income', 'income', 'plus-circle', '#45B7D1'),
  ('Food', 'expense', 'food', '#FF6B6B'), ('Transport', 'expense', 'car', '#5F27CD'), ('Bills', 'expense', 'file-document', '#F7B731'),
  ('Shopping', 'expense', 'shopping', '#26DE81'), ('Health', 'expense', 'medical-bag', '#EE5A6F'), ('Other', 'expense', 'dots-horizontal', '#95A5A6');
