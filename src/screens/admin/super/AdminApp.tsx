// Super admin panel at /mikasa/go (web only). Own login and token, separate from the normal app session.
import React, { useEffect, useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { Appbar, Button, Card, Drawer, HelperText, Text, TextInput, useTheme } from 'react-native-paper';
import { adminApi, adminLogout, hasAdminToken, setOnAdminLogout } from './adminApi';
import { Chats, Dashboard, Expenses, Groups, Logs, Notifications, Settings, Settlements, Users } from './pages';

const PAGES = { Dashboard, Users, Groups, Expenses, Settlements, Chats, Notifications, Logs, Settings };
const ICONS: Record<keyof typeof PAGES, string> = {
  Dashboard: 'view-dashboard', Users: 'account-multiple', Groups: 'account-group', Expenses: 'cash', Settlements: 'swap-horizontal',
  Chats: 'chat', Notifications: 'bell', Logs: 'text-box-search', Settings: 'cog',
};
type PageName = keyof typeof PAGES;

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'password' | 'otp'>('password');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const theme = useTheme();
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (step === 'password') { await adminApi.login(email.trim(), password); setStep('otp'); }
      else { await adminApi.verify(email.trim(), code.trim()); onDone(); }
    } catch (e: any) { setError(e?.message ?? 'Failed'); } finally { setBusy(false); }
  };
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16, backgroundColor: theme.colors.background }}>
      <Card style={{ width: '100%', maxWidth: 400 }}>
        <Card.Title title="Admin login" subtitle={step === 'otp' ? `Code sent to ${email}` : undefined} />
        <Card.Content>
          {step === 'password' ? (
            <>
              <TextInput label="Email" mode="outlined" autoCapitalize="none" value={email} onChangeText={setEmail} />
              <TextInput label="Password" mode="outlined" secureTextEntry value={password} onChangeText={setPassword} onSubmitEditing={submit} style={{ marginTop: 8 }} />
            </>
          ) : (
            <TextInput label="6-digit code" mode="outlined" keyboardType="number-pad" value={code} onChangeText={setCode} onSubmitEditing={submit} />
          )}
          {!!error && <HelperText type="error">{error}</HelperText>}
        </Card.Content>
        <Card.Actions>
          {step === 'otp' && <Button onPress={() => setStep('password')}>Back</Button>}
          <Button mode="contained" loading={busy} disabled={busy} onPress={submit}>{step === 'password' ? 'Continue' : 'Verify'}</Button>
        </Card.Actions>
      </Card>
    </View>
  );
}

export default function AdminApp() {
  const [authed, setAuthed] = useState(hasAdminToken);
  const narrow = useWindowDimensions().width < 768;
  const bg = { backgroundColor: useTheme().colors.background };
  const [menuOpen, setMenuOpen] = useState(false);
  const [page, setPage] = useState<PageName>(() => {
    const p = window.location.pathname.split('/')[3];
    return (Object.keys(PAGES) as PageName[]).find((k) => k.toLowerCase() === p) ?? 'Dashboard';
  });
  useEffect(() => { setOnAdminLogout(() => setAuthed(false)); }, []);
  useEffect(() => { window.history.replaceState(null, '', `/mikasa/go/${page.toLowerCase()}`); document.title = `Admin · ${page}`; }, [page]);

  if (!authed) return <Login onDone={() => setAuthed(true)} />;
  const Page = PAGES[page];
  const menu = (
    <>
      {(Object.keys(PAGES) as PageName[]).map((k) => (
        <Drawer.Item key={k} label={k} icon={ICONS[k]} active={page === k} onPress={() => { setPage(k); setMenuOpen(false); }} />
      ))}
      <Drawer.Item label="Log out" icon="logout" onPress={adminLogout} />
    </>
  );
  // Phones: top bar + menu that opens over the page instead of a fixed sidebar.
  if (narrow) {
    return (
      <View style={[{ flex: 1, height: '100%' as any }, bg]}>
        <Appbar.Header mode="small" statusBarHeight={0}>
          <Appbar.Action icon={menuOpen ? 'close' : 'menu'} onPress={() => setMenuOpen((o) => !o)} accessibilityLabel="Menu" />
          <Appbar.Content title={page} />
        </Appbar.Header>
        {menuOpen
          ? <ScrollView>{menu}</ScrollView>
          : <View style={{ flex: 1, padding: 12 }}><Page /></View>}
      </View>
    );
  }
  return (
    <View style={[{ flex: 1, flexDirection: 'row', height: '100%' as any }, bg]}>
      <ScrollView style={{ width: 220, flexGrow: 0, borderRightWidth: 1, borderColor: '#ddd' }}>
        <Text variant="titleMedium" style={{ padding: 16 }}>Flatmate Admin</Text>
        {menu}
      </ScrollView>
      <View style={{ flex: 1, padding: 16 }}>
        <Text variant="headlineSmall" style={{ marginBottom: 12 }}>{page}</Text>
        <Page />
      </View>
    </View>
  );
}
