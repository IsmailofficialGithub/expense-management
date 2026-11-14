// Who owes whom in one group, for its members.
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { ActivityIndicator, Button, HelperText, useTheme } from 'react-native-paper';
import DebtsView, { type GroupDebts } from '../../components/DebtsView';
import { groupService } from '../../services/domain/people';
import { useAuth } from '../../hooks/useAuth';

export default function GroupDebtsScreen({ route, navigation }: any) {
  const { groupId } = route.params;
  const theme = useTheme();
  const { profile } = useAuth();
  const [data, setData] = useState<GroupDebts | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      setData(await groupService.getGroupDebts(groupId));
    } catch (e: any) {
      setError(e?.message ?? 'Could not load balances');
    }
  }, [groupId]);

  useEffect(() => { load(); }, [load]);
  // Refresh when coming back from an expense, in case it was edited.
  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      {error ? (
        <>
          <HelperText type="error">{error}</HelperText>
          <Button onPress={load}>Try again</Button>
        </>
      ) : !data ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : (
        <DebtsView data={data} meId={profile?.id}
          onOpenExpense={(expenseId) => navigation.navigate('ExpenseDetails', { expenseId })} />
      )}
    </ScrollView>
  );
}
