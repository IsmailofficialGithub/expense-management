import React, { useEffect, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { Avatar, Button, Card, Chip, Divider, HelperText, IconButton, Switch, Text, TextInput } from 'react-native-paper';
import AdminTable from './AdminTable';
import { adminApi } from './adminApi';
import { startImpersonation } from '../../../utils/adminPortal';
import DebtsView, { type GroupDebts } from '../../../components/DebtsView';

const json = (v: unknown) => JSON.stringify(v, null, 2);
const mono = { fontFamily: 'monospace', fontSize: 12 } as const;
const when = (r: any) => (r.created_at ? new Date(r.created_at).toLocaleString() : '');

export function Dashboard() {
  const [stats, setStats] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { adminApi.get('/admin/stats').then(setStats).catch((e) => setError(e.message)); }, []);
  if (error) return <HelperText type="error">{error}</HelperText>;
  if (!stats) return <Text>Loading…</Text>;
  const scalars = Object.entries(stats).filter(([, v]) => typeof v !== 'object' || v === null);
  const nested = Object.entries(stats).filter(([, v]) => typeof v === 'object' && v !== null);
  return (
    <ScrollView>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {scalars.map(([k, v]) => (
          <Card key={k} style={{ flexGrow: 1, flexBasis: 140 }}><Card.Content>
            <Text variant="labelMedium">{k.replace(/_/g, ' ')}</Text>
            <Text variant="headlineSmall">{String(v)}</Text>
          </Card.Content></Card>
        ))}
      </View>
      {nested.map(([k, v]) => (
        <Card key={k} style={{ marginTop: 12 }}><Card.Title title={k.replace(/_/g, ' ')} /><Card.Content>
          {Array.isArray(v)
            ? v.map((r: any, i: number) => <Text key={r.id ?? i}>{r.message ? `${when(r)} · ${r.message}` : JSON.stringify(r)}</Text>)
            : <Text style={mono}>{json(v)}</Text>}
        </Card.Content></Card>
      ))}
    </ScrollView>
  );
}

// Fresh, styled report for one user, by email + WhatsApp (if they have a number and WhatsApp is connected).
function SendReport({ userId }: { userId: string }) {
  const [state, setState] = useState('');
  const send = async (type: 'daily' | 'weekly') => {
    setState('sending…');
    try {
      const r = await adminApi.post(`/admin/reports/run?type=${type}&user_id=${userId}`);
      setState(r.sent ? 'sent ✓' : 'not sent');
    } catch (e: any) { setState(e.message); }
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
      <Button compact icon="send" onPress={() => send('daily')}>Daily report</Button>
      <Button compact icon="send" onPress={() => send('weekly')}>Weekly</Button>
      {!!state && <Text variant="labelSmall">{state}</Text>}
    </View>
  );
}

// Open the normal app as this user (marked session: yellow banner, audit log names the admin).
function LoginAs({ user }: { user: any }) {
  const [error, setError] = useState('');
  const go = async () => {
    if (!window.confirm(`Log in to the app as ${user.email}? You will see the app exactly as they do. Use "Exit" in the yellow bar to come back.`)) return;
    try { await startImpersonation(await adminApi.post(`/admin/users/${user.id}/impersonate`)); } catch (e: any) { setError(e.message); }
  };
  return (
    <>
      <Button compact icon="incognito" onPress={go}>Log in as</Button>
      {!!error && <Text variant="labelSmall">{error}</Text>}
    </>
  );
}

export const Users = () => (
  <AdminTable resource="users" canCreate={false}
    columns={[{ key: 'email' }, { key: 'full_name' }, { key: 'phone_e164', label: 'phone' },
      { key: 'phone_needs_country', label: 'flag', render: (r) => (r.phone_needs_country ? <Chip compact>needs country</Chip> : '') }, { key: 'created_at' }]}
    fields={['full_name', 'phone', 'phone_e164', 'report_daily', 'report_weekly', 'whatsapp_opt_in']}
    onDelete={(r) => adminApi.post(`/admin/users/${r.id}/delete`)}
    rowActions={(r) => <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}><LoginAs user={r} /><SendReport userId={r.id} /></View>} />
);

const money = (v: unknown) => `₹${Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const day = (v: unknown) => (v ? new Date(String(v)).toLocaleDateString() : '');

export const Groups = () => (
  <AdminTable resource="groups"
    columns={[{ key: 'name' }, { key: 'creator_name', label: 'created by' }, { key: 'member_count', label: 'members' },
      { key: 'created_at', label: 'created', render: (r) => day(r.created_at) }]}
    fields={['name', 'description', 'created_by']}
    renderExpanded={(r) => <AdminTable resource="members" filters={{ group_id: r.id }}
      columns={[{ key: 'user_name', label: 'name' }, { key: 'role' }, { key: 'status' }]} fields={['group_id', 'user_id', 'role', 'status']} />} />
);

export const Expenses = () => (
  <AdminTable resource="expenses"
    columns={[{ key: 'description' }, { key: 'amount', render: (r) => money(r.amount) }, { key: 'group_name', label: 'group' },
      { key: 'payer_name', label: 'paid by' }, { key: 'date', render: (r) => day(r.date) }]}
    fields={['group_id', 'description', 'amount', 'category_id', 'paid_by', 'date', 'split_type', 'splits', 'notes']}
    renderExpanded={(r) => <Text selectable style={mono}>{json(r)}</Text>} />
);

export const Settlements = () => (
  <AdminTable resource="settlements"
    columns={[{ key: 'from_name', label: 'from', render: (r) => `${r.from_name} → ${r.to_name}` },
      { key: 'amount', render: (r) => money(r.amount) }, { key: 'group_name', label: 'group' },
      { key: 'settled_at', label: 'date', render: (r) => day(r.settled_at ?? r.created_at) }, { key: 'notes' }]}
    fields={['group_id', 'from_user', 'to_user', 'amount', 'notes']} />
);

export const Notifications = () => (
  <AdminTable resource="notifications"
    columns={[{ key: 'user_name', label: 'user' }, { key: 'title' }, { key: 'message' },
      { key: 'is_read', label: 'read', render: (r) => (r.is_read ? 'yes' : 'no') }, { key: 'created_at', label: 'when', render: when }]}
    fields={['user_id', 'type', 'title', 'message', 'is_read']} />
);

// One conversation: messages as chat bubbles, newest at the bottom, and a "send as" picker of its participants.
function Conversation({ chat, onBack }: { chat: any; onBack: () => void }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [sender, setSender] = useState('');
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const [error, setError] = useState('');
  const load = async () => {
    try {
      const [m, p] = await Promise.all([
        adminApi.get('/admin/messages', { conversation_id: chat.id, limit: 200 }),
        adminApi.get('/admin/participants', { conversation_id: chat.id, limit: 200 }),
      ]);
      setMessages([...m.rows].reverse());
      setPeople(p.rows);
      setSender((s) => s || p.rows[0]?.user_id || '');
    } catch (e: any) { setError(e.message); }
  };
  useEffect(() => { load(); }, [chat.id]);
  const send = async () => {
    try {
      setError('');
      if (editing) await adminApi.patch(`/admin/messages/${editing.id}`, { text });
      else await adminApi.post(`/admin/chats/${chat.id}/messages`, { sender_id: sender, text });
      setText(''); setEditing(null); load();
    } catch (e: any) { setError(e.message); }
  };
  const remove = async (m: any) => {
    if (!window.confirm('Delete this message?')) return;
    try { await adminApi.del(`/admin/messages/${m.id}`); load(); } catch (e: any) { setError(e.message); }
  };
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <IconButton icon="arrow-left" onPress={onBack} accessibilityLabel="Back to chats" />
        <Text variant="titleMedium" style={{ flex: 1 }} numberOfLines={1}>{chat.title}</Text>
        <IconButton icon="refresh" onPress={load} accessibilityLabel="Refresh" />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 8, gap: 8 }}>
        {!messages.length && <Text style={{ textAlign: 'center', opacity: 0.6 }}>No messages</Text>}
        {messages.map((m) => (
          <Card key={m.id} mode="contained" style={{ maxWidth: '85%', alignSelf: m.sender_id === sender ? 'flex-end' : 'flex-start' }}>
            <Card.Content style={{ paddingVertical: 8 }}>
              <Text variant="labelMedium" style={{ opacity: 0.7 }}>
                {m.sender_name}{m.admin_action ? ` · ${m.admin_action} by admin` : ''}{m.is_deleted ? ' · deleted' : ''}
              </Text>
              <Text variant="bodyMedium" selectable>{m.text}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
                <Text variant="labelSmall" style={{ opacity: 0.6, flex: 1 }}>{when(m)}</Text>
                <IconButton icon="pencil" size={16} onPress={() => { setEditing(m); setText(m.text); }} accessibilityLabel="Edit message" />
                <IconButton icon="delete" size={16} onPress={() => remove(m)} accessibilityLabel="Delete message" />
              </View>
            </Card.Content>
          </Card>
        ))}
      </ScrollView>
      {!editing && (
        <ScrollView horizontal style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, paddingVertical: 6 }}>
          <Text variant="labelMedium" style={{ alignSelf: 'center' }}>Send as:</Text>
          {people.map((p) => (
            <Chip key={p.user_id} compact selected={sender === p.user_id} onPress={() => setSender(p.user_id)}>{p.user_name}</Chip>
          ))}
        </ScrollView>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput dense mode="outlined" style={{ flex: 1 }} value={text} onChangeText={setText}
          placeholder={editing ? 'Edit message' : 'Message'} onSubmitEditing={send} />
        {editing && <IconButton icon="close" onPress={() => { setEditing(null); setText(''); }} accessibilityLabel="Cancel edit" />}
        <IconButton icon="send" mode="contained" disabled={!text.trim() || (!editing && !sender)} onPress={send} accessibilityLabel="Send" />
      </View>
      {!!error && <HelperText type="error">{error}</HelperText>}
    </View>
  );
}

export function Chats() {
  const [open, setOpen] = useState<any | null>(null);
  if (open) return <Conversation chat={open} onBack={() => setOpen(null)} />;
  return (
    <AdminTable resource="chats" onRowPress={setOpen}
      columns={[{ key: 'title', label: 'chat' }, { key: 'type' }, { key: 'message_count', label: 'messages' },
        { key: 'last_message_text', label: 'last message' }, { key: 'last_message_at', label: 'last active', render: (r) => day(r.last_message_at) }]} />
  );
}

// Who owes whom, one group at a time. Groups with the most money outstanding come first.
export function Balances() {
  const [groups, setGroups] = useState<any[] | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [data, setData] = useState<(GroupDebts & { group: { name: string } }) | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    adminApi.get('/admin/debts').then((g) => { setGroups(g); setGroupId((id) => id ?? g[0]?.id ?? null); }).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!groupId) return;
    setData(null);
    adminApi.get('/admin/debts', { group_id: groupId }).then(setData).catch((e) => setError(e.message));
  }, [groupId]);
  if (error) return <HelperText type="error">{error}</HelperText>;
  if (!groups) return <Text>Loading…</Text>;
  if (!groups.length) return <Text>No group has any expenses yet.</Text>;
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
        {groups.map((g) => (
          <Chip key={g.id} selected={g.id === groupId} showSelectedCheck={false} onPress={() => setGroupId(g.id)}
            icon={g.open_debts ? 'account-arrow-right' : 'check-circle-outline'}>
            {g.name} · {g.open_debts ? `${money(g.outstanding)} open` : 'settled'}
          </Chip>
        ))}
      </ScrollView>
      {data ? <DebtsView data={data} /> : <Text>Loading…</Text>}
    </ScrollView>
  );
}

export const Logs = () => (
  <AdminTable resource="logs"
    columns={[{ key: 'created_at', label: 'when', render: when }, { key: 'actor_email', label: 'who' }, { key: 'message' },
      { key: 'status', render: (r) => <Text style={{ color: r.status >= 400 ? '#c62828' : undefined }}>{r.status}</Text> }, { key: 'duration_ms', label: 'ms' }]}
    renderExpanded={(r) => <Text selectable style={mono}>{json(r)}</Text>} />
);

// Settings cards sit side by side on wide screens and stack on phones; equal height per row.
const card = { flexGrow: 1, flexBasis: 320, maxWidth: 560 } as const;
const muted = { opacity: 0.7 } as const;

function SwitchRow({ label, hint, value, disabled, onChange }: { label: string; hint: string; value: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
      <View style={{ flex: 1 }}>
        <Text variant="bodyLarge">{label}</Text>
        <Text variant="bodySmall" style={muted}>{hint}</Text>
      </View>
      <Switch value={value} disabled={disabled} onValueChange={onChange} />
    </View>
  );
}

// Global switches for notification emails / WhatsApps (expenses, invites, reports). Login codes always go out.
function NotificationChannels({ onMessage }: { onMessage: (m: string) => void }) {
  const [ch, setCh] = useState<{ email: boolean; whatsapp: boolean } | null>(null);
  useEffect(() => { adminApi.get('/admin/notification-channels').then(setCh).catch((e) => onMessage(e.message)); }, []);
  const toggle = async (key: 'email' | 'whatsapp', value: boolean) => {
    setCh((c) => (c ? { ...c, [key]: value } : c));
    try { setCh(await adminApi.put('/admin/notification-channels', { [key]: value })); } catch (e: any) {
      setCh((c) => (c ? { ...c, [key]: !value } : c));
      onMessage(e.message);
    }
  };
  return (
    <Card style={card}>
      <Card.Title title="Notifications" titleVariant="titleMedium" left={(p) => <Avatar.Icon {...p} icon="bell-outline" />} />
      <Card.Content>
        <SwitchRow label="Email" hint="Expense, advance, invite and report emails" value={!!ch?.email} disabled={!ch}
          onChange={(v) => toggle('email', v)} />
        <Divider />
        <SwitchRow label="WhatsApp" hint="Same messages to users' phones" value={!!ch?.whatsapp} disabled={!ch}
          onChange={(v) => toggle('whatsapp', v)} />
        <Text variant="labelSmall" style={[muted, { marginTop: 8 }]}>Login codes and account emails are always sent.</Text>
      </Card.Content>
    </Card>
  );
}

export function Settings() {
  const [wa, setWa] = useState<{ status: string; qr?: string; me?: string } | null>(null);
  const [msg, setMsg] = useState('');
  const [testPhone, setTestPhone] = useState('+92');
  const poll = () => adminApi.get('/admin/whatsapp/status').then(setWa).catch((e) => setMsg(e.message));
  useEffect(() => { poll(); const t = setInterval(poll, 3000); return () => clearInterval(t); }, []);
  const act = (label: string, fn: () => Promise<any>) => async () => {
    setMsg(`${label}…`);
    try { const r = await fn(); setMsg(`${label}: ${r ? JSON.stringify(r) : 'ok'}`); poll(); } catch (e: any) { setMsg(`${label} failed: ${e.message}`); }
  };
  const connected = wa?.status === 'connected';
  const statusLabel = !wa ? 'loading…' : connected ? `Connected${wa.me ? ` · +${wa.me}` : ''}` : wa.status === 'qr' ? 'Waiting for scan' : 'Disconnected';
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <NotificationChannels onMessage={setMsg} />

        <Card style={card}>
          <Card.Title title="WhatsApp" titleVariant="titleMedium" left={(p) => <Avatar.Icon {...p} icon="whatsapp" />}
            right={() => (
              <Chip compact icon={connected ? 'check-circle' : 'close-circle-outline'} style={{ marginRight: 16 }}
                selectedColor={connected ? '#2e7d32' : undefined}>{statusLabel}</Chip>
            )} />
          <Card.Content style={{ gap: 12 }}>
            {wa?.status === 'qr' && wa.qr && (
              <View style={{ alignItems: 'center', gap: 4 }}>
                <Image source={{ uri: wa.qr }} style={{ width: 220, height: 220 }} />
                <Text variant="bodySmall" style={muted}>Scan with WhatsApp → Linked devices</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {connected
                ? <Button mode="outlined" icon="link-off" onPress={act('Disconnect', () => adminApi.post('/admin/whatsapp/disconnect'))}>Disconnect</Button>
                : <Button mode="contained" icon="link" onPress={act('Connect', () => adminApi.post('/admin/whatsapp/connect'))} disabled={wa?.status === 'qr'}>Connect</Button>}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput dense mode="outlined" label="Test number" placeholder="+923001234567" value={testPhone} onChangeText={setTestPhone}
                keyboardType="phone-pad" style={{ flex: 1 }} />
              <Button mode="contained-tonal" icon="send" disabled={!connected}
                onPress={act('Test WhatsApp', () => adminApi.post('/admin/whatsapp/test', { phone: testPhone.replace(/[\s-]/g, '') }))}>Test</Button>
            </View>
          </Card.Content>
        </Card>

        <Card style={card}>
          <Card.Title title="Reports" titleVariant="titleMedium" left={(p) => <Avatar.Icon {...p} icon="file-chart-outline" />} />
          <Card.Content style={{ gap: 12 }}>
            <Text variant="bodySmall" style={muted}>
              Sent automatically to users who have them turned on. Run one now to send it to everyone straight away.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Button mode="contained-tonal" icon="calendar-today" onPress={act('Daily report', () => adminApi.post('/admin/reports/run?type=daily'))}>Daily report</Button>
              <Button mode="contained-tonal" icon="calendar-week" onPress={act('Weekly report', () => adminApi.post('/admin/reports/run?type=weekly'))}>Weekly report</Button>
            </View>
          </Card.Content>
        </Card>
      </View>
      {!!msg && <HelperText type="info">{msg}</HelperText>}
      <Text variant="titleMedium" style={{ marginTop: 24, marginBottom: 4 }}>Outbound messages</Text>
      <Text variant="bodySmall" style={{ marginBottom: 8, opacity: 0.7 }}>
        ↻ resends that exact old message on its own channel. To send a fresh report to someone, use Users → Daily report.
      </Text>
      <AdminTable resource="outbound"
        columns={[{ key: 'created_at', render: when }, { key: 'channel' }, { key: 'to_addr', label: 'to' }, { key: 'kind' }, { key: 'status' }, { key: 'attempts' }, { key: 'last_error' }]}
        rowActions={(r, reload) => <IconButton icon="replay" size={18} accessibilityLabel="Resend this exact old message" onPress={async () => {
          try { await adminApi.post(`/admin/outbound/${r.id}/resend`); reload(); } catch (e: any) { setMsg(e.message); }
        }} />}
        renderExpanded={(r) => <Text selectable style={mono}>{json(r)}</Text>} />
    </ScrollView>
  );
}
