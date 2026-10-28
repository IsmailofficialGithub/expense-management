import { db } from './db.js';

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

// Replaces Supabase RLS: every group-scoped route calls this before touching group data.
export async function assertGroupMember(groupId: string, userId: string) {
  const { rowCount } = await db.query(
    'select 1 from group_members where group_id = $1 and user_id = $2',
    [groupId, userId],
  );
  if (!rowCount) throw new HttpError(403, 'Not a member of this group');
}

export async function assertGroupAdmin(groupId: string, userId: string) {
  const { rows } = await db.query(
    `select 1 from group_members gm join groups g on g.id = gm.group_id
      where gm.group_id = $1 and gm.user_id = $2 and (gm.role = 'admin' or g.created_by = $2)`,
    [groupId, userId],
  );
  if (!rows.length) throw new HttpError(403, 'Group admin only');
}

export async function assertConversationParticipant(conversationId: string, userId: string) {
  const { rowCount } = await db.query(
    'select 1 from conversation_participants where conversation_id = $1 and user_id = $2',
    [conversationId, userId],
  );
  if (!rowCount) throw new HttpError(403, 'Not a participant');
}
