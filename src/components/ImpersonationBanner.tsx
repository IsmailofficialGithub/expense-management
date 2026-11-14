// Shown across the top of the app while a super admin is logged in as someone else.
import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getStoredUser, onAuthChange } from '../services/api';
import { endImpersonation } from '../utils/adminPortal';

type U = { email: string; imp?: string } | null;

export default function ImpersonationBanner() {
  const [user, setUser] = useState<U>(null);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    getStoredUser().then((u) => setUser(u as U));
    const off = onAuthChange((u) => setUser(u as U));
    return () => { off(); };
  }, []);
  if (Platform.OS !== 'web' || !user?.imp) return null;
  return (
    <View style={styles.bar}>
      <MaterialCommunityIcons name="incognito" size={18} color="#1a1a1a" />
      <Text style={styles.text} numberOfLines={2}>
        Logged in as <Text style={styles.bold}>{user.email}</Text> by admin {user.imp}
      </Text>
      <Button compact mode="contained" buttonColor="#1a1a1a" textColor="#FFD54F" loading={leaving} disabled={leaving}
        onPress={() => { setLeaving(true); endImpersonation().catch(() => setLeaving(false)); }}>
        Exit
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#FFD54F' },
  text: { flex: 1, color: '#1a1a1a', fontSize: 13 },
  bold: { fontWeight: '700', color: '#1a1a1a' },
});
