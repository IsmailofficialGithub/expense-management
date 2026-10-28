import { useEffect, useState } from 'react';
import { invitationService } from '../services/supabase.service';
import { subscribe } from '../services/realtime';

// One shared count for the Profile tab badge and the Group Invitations row.
let count = 0;
const listeners = new Set<(n: number) => void>();

export async function refreshPendingInvitations() {
  try {
    count = (await invitationService.getPendingInvitations()).length;
    listeners.forEach((l) => l(count));
  } catch {}
}

export function usePendingInvitationCount(userId?: string) {
  const [n, setN] = useState(count);
  useEffect(() => {
    if (!userId) return;
    listeners.add(setN);
    refreshPendingInvitations();
    const unsub = subscribe(`user:${userId}`, (event) => {
      if (event === 'invitation_received' || event === 'invitation_revoked' || event === 'members_changed') refreshPendingInvitations();
    });
    return () => { listeners.delete(setN); unsub(); };
  }, [userId]);
  return n;
}
