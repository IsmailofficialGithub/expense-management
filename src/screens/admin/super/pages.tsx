import React, { useEffect, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { Button, Card, Chip, HelperText, IconButton, Text, TextInput } from 'react-native-paper';
import AdminTable from './AdminTable';
import { adminApi } from './adminApi';

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

export const Users = () => (
  <AdminTable resource="users" canCreate={false}
    columns={[{ key: 'email' }, { key: 'full_name' }, { key: 'phone_e164', label: 'phone' },
      { key: 'phone_needs_country', label: 'flag', render: (r) => (r.phone_needs_country ? <Chip compact>needs country</Chip> : '') }, { key: 'created_at' }]}
    fields={['full_name', 'phone', 'phone_e164', 'report_daily', 'report_weekly', 'whatsapp_opt_in']}
    onDelete={(r) => adminApi.post(`/admin/users/${r.id}/delete`)} />
);

export const Groups = () => (
  <AdminTable resource="groups" columns={[{ key: 'name' }, { key: 'description' }, { key: 'created_by' }, { key: 'created_at' }]}
    fields={['name', 'description', 'created_by']}
    renderExpanded={(r) => <AdminTable resource="members" filters={{ group_id: r.id }}
      columns={[{ key: 'user_id' }, { key: 'role' }, { key: 'status' }]} fields={['group_id', 'user_id', 'role', 'status']} />} />
);

export const Expenses = () => (
  <AdminTable resource="expenses" columns={[{ key: 'description' }, { key: 'amount' }, { key: 'group_id' }, { key: 'paid_by' }, { key: 'date' }]}
    fields={['group_id', 'description', 'amount', 'category_id', 'paid_by', 'date', 'split_type', 'splits', 'notes']}
    renderExpanded={(r) => <Text style={mono}>{json(r)}</Text>} />
);

export const Settlements = () => (
  <AdminTable resource="settlements" columns={[{ key: 'group_id' }, { key: 'from_user' }, { key: 'to_user' }, { key: 'amount' }, { key: 'created_at' }]}
    fields={['group_id', 'from_user', 'to_user', 'amount', 'notes']} />
);

export const Notifications = () => (
  <AdminTable resource="notifications" columns={[{ key: 'user_id' }, { key: 'title' }, { key: 'message' }, { key: 'is_read' }, { key: 'created_at' }]}
    fields={['user_id', 'type', 'title', 'message', 'is_read']} />
);

function ConversationMessages({ conversationId }: { conversationId: string }) {
  const [sender, setSender] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [key, setKey] = useState(0);
  const send = async () => {
    try {
      setError('');
      await adminApi.post(`/admin/chats/${conversationId}/messages`, { sender_id: sender.trim(), text });
      setText('');
      setKey((k) => k + 1);
    } catch (e: any) { setError(e.message); }
  };
  return (
    <View>
      <AdminTable key={key} resource="messages" filters={{ conversation_id: conversationId }} canCreate={false}
        columns={[{ key: 'created_at', render: when }, { key: 'sender_id' }, { key: 'text' }, { key: 'admin_action' }]}
        fields={['text']} />
      <Text variant="titleSmall" style={{ marginTop: 8 }}>Send as user</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <TextInput dense mode="outlined" label="Sender user id" value={sender} onChangeText={setSender} style={{ flexGrow: 1, minWidth: 220 }} />
        <TextInput dense mode="outlined" label="Message" value={text} onChangeText={setText} style={{ flexGrow: 2, minWidth: 220 }} />
        <Button mode="contained" disabled={!sender.trim() || !text.trim()} onPress={send}>Send</Button>
      </View>
      {!!error && <HelperText type="error">{error}</HelperText>}
    </View>
  );
}

export const Chats = () => (
  <AdminTable resource="chats" columns={[{ key: 'id' }, { key: 'type' }, { key: 'group_id' }, { key: 'last_message_text', label: 'last message' }, { key: 'updated_at' }]}
    fields={['type', 'group_id', 'created_by']} renderExpanded={(r) => <ConversationMessages conversationId={r.id} />} />
);

export const Logs = () => (
  <AdminTable resource="logs"
    columns={[{ key: 'created_at', label: 'when', render: when }, { key: 'actor_email', label: 'who' }, { key: 'message' },
      { key: 'status', render: (r) => <Text style={{ color: r.status >= 400 ? '#c62828' : undefined }}>{r.status}</Text> }, { key: 'duration_ms', label: 'ms' }]}
    renderExpanded={(r) => <Text selectable style={mono}>{json(r)}</Text>} />
);

export function Settings() {
  const [wa, setWa] = useState<{ status: string; qr?: string; me?: string } | null>(null);
  const [msg, setMsg] = useState('');
  const poll = () => adminApi.get('/admin/whatsapp/status').then(setWa).catch((e) => setMsg(e.message));
  useEffect(() => { poll(); const t = setInterval(poll, 3000); return () => clearInterval(t); }, []);
  const act = (label: string, fn: () => Promise<any>) => async () => {
    setMsg(`${label}…`);
    try { const r = await fn(); setMsg(`${label}: ${r ? JSON.stringify(r) : 'ok'}`); poll(); } catch (e: any) { setMsg(`${label} failed: ${e.message}`); }
  };
  return (
    <ScrollView>
      <Card><Card.Title title="WhatsApp" subtitle={wa ? `${wa.status}${wa.me ? ` · ${wa.me}` : ''}` : 'loading…'} />
        <Card.Content>
          {wa?.status === 'qr' && wa.qr && <Image source={{ uri: wa.qr }} style={{ width: 260, height: 260 }} />}
          {wa?.status === 'qr' && <Text>Scan with WhatsApp → Linked devices.</Text>}
        </Card.Content>
        <Card.Actions>
          <Button onPress={act('Connect', () => adminApi.post('/admin/whatsapp/connect'))} disabled={wa?.status === 'connected'}>Connect</Button>
          <Button onPress={act('Disconnect', () => adminApi.post('/admin/whatsapp/disconnect'))} disabled={wa?.status === 'disconnected'}>Disconnect</Button>
        </Card.Actions>
      </Card>
      <Card style={{ marginTop: 12 }}><Card.Title title="Reports" />
        <Card.Actions>
          <Button onPress={act('Daily report', () => adminApi.post('/admin/reports/run?type=daily'))}>Run daily report</Button>
          <Button onPress={act('Weekly report', () => adminApi.post('/admin/reports/run?type=weekly'))}>Run weekly report</Button>
        </Card.Actions>
      </Card>
      {!!msg && <HelperText type="info">{msg}</HelperText>}
      <Text variant="titleMedium" style={{ marginVertical: 12 }}>Outbound messages</Text>
      <AdminTable resource="outbound"
        columns={[{ key: 'created_at', render: when }, { key: 'channel' }, { key: 'to_addr', label: 'to' }, { key: 'kind' }, { key: 'status' }, { key: 'attempts' }, { key: 'last_error' }]}
        rowActions={(r, reload) => <IconButton icon="send" size={18} onPress={async () => {
          try { await adminApi.post(`/admin/outbound/${r.id}/resend`); reload(); } catch (e: any) { setMsg(e.message); }
        }} />}
        renderExpanded={(r) => <Text selectable style={mono}>{json(r)}</Text>} />
    </ScrollView>
  );
}
