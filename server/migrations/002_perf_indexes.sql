-- Lookups by user / foreign key that the routes hit on every request.
create index if not exists group_members_user_idx on group_members (user_id);
create index if not exists conversation_participants_user_idx on conversation_participants (user_id);
create index if not exists expenses_paid_by_idx on expenses (paid_by);
create index if not exists expense_splits_expense_idx on expense_splits (expense_id);
create index if not exists expense_food_items_expense_idx on expense_food_items (expense_id);
create index if not exists group_invitations_pending_email_idx on group_invitations (invited_email) where status = 'pending';
create index if not exists message_deletions_user_idx on message_deletions (user_id, message_id);
create index if not exists settlements_from_idx on settlements (group_id, from_user);
create index if not exists settlements_to_idx on settlements (group_id, to_user);

-- Correlated subqueries so a one-group filter only touches that group's rows (same columns as 001).
create or replace view user_group_balances as
select gm.group_id, gm.user_id,
  coalesce(p.paid, 0) + coalesce(s_out.amt, 0) as total_paid,
  coalesce(o.owed, 0) + coalesce(s_in.amt, 0) as total_owed,
  coalesce(p.paid, 0) + coalesce(s_out.amt, 0) - coalesce(o.owed, 0) - coalesce(s_in.amt, 0) as balance
from group_members gm
cross join lateral (select sum(amount) paid from expenses where group_id = gm.group_id and paid_by = gm.user_id) p
cross join lateral (select sum(s.amount) owed from expense_splits s join expenses e on e.id = s.expense_id
                     where e.group_id = gm.group_id and s.user_id = gm.user_id) o
cross join lateral (select sum(amount) amt from settlements where group_id = gm.group_id and from_user = gm.user_id) s_out
cross join lateral (select sum(amount) amt from settlements where group_id = gm.group_id and to_user = gm.user_id) s_in;
