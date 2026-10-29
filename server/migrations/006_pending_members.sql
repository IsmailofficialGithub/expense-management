-- Invitees can be put in expense splits before they accept. The table keeps every membership row
-- (active / pending / left); group_members becomes a view of active rows only, so every existing
-- access check and member query keeps meaning "real member" unchanged.
-- Views already built on the table (user_group_balances) follow the rename, so pending and left
-- people still show their share in balances.
alter table group_members rename to group_memberships;
alter table group_memberships add column status text not null default 'active'
  check (status in ('active', 'pending', 'left'));
create view group_members as
  select id, group_id, user_id, role, joined_at from group_memberships where status = 'active';
