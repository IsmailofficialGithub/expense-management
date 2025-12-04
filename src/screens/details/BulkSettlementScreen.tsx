// src/screens/details/BulkSettlementScreen.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  RefreshControl,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  RadioButton,
  Divider,
  useTheme,
  ActivityIndicator,
  Avatar,
  Chip,
  TextInput,
} from 'react-native-paper';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  fetchBulkSettlementSummary,
  createBulkSettlement,
  clearBulkSettlementSummary,
} from '../../store/slices/bulkPaymentsSlice';
import { useAuth } from '../../hooks/useAuth';
import { useGroups } from '../../hooks/useGroups';
import { useToast } from '../../hooks/useToast';
import { ErrorHandler } from '../../utils/errorHandler';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import LoadingOverlay from '../../components/LoadingOverlay';

type Props = NativeStackScreenProps<RootStackParamList, 'BulkSettlement'>;

export default function BulkSettlementScreen({ navigation, route }: Props) {
  const { groupId } = route.params;
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { profile } = useAuth();
  const { selectedGroup } = useGroups();
  const { showToast } = useToast();
  const { bulkSettlementSummary, loading } = useAppSelector(
    state => state.bulkPayments
  );

  const [refreshing, setRefreshing] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadSummary();
    return () => {
      dispatch(clearBulkSettlementSummary());
    };
  }, [groupId]);

  const loadSummary = async () => {
    if (!selectedRecipient) return;
    
    try {
      await dispatch(
        fetchBulkSettlementSummary({
          groupId,
          recipientId: selectedRecipient,
        })
      ).unwrap();
    } catch (error) {
      ErrorHandler.handleError(error, showToast, 'Load Settlement Summary');
    }
  };

  useEffect(() => {
    if (selectedRecipient) {
      loadSummary();
    }
  }, [selectedRecipient]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSummary();
    setRefreshing(false);
  };

  const handleBulkSettlement = async () => {
    if (!selectedRecipient) {
      showToast('Please select a recipient', 'error');
      return;
    }

    if (!bulkSettlementSummary || bulkSettlementSummary.member_debts.length === 0) {
      showToast('No debts to settle', 'error');
      return;
    }

    Alert.alert(
      'Confirm Bulk Settlement',
      `This will settle all debts (₹${bulkSettlementSummary.total_amount.toFixed(2)}) to ${bulkSettlementSummary.recipient_name}. All expense splits will be marked as settled. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'destructive',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              await dispatch(
                createBulkSettlement({
                  group_id: groupId,
                  recipient_id: selectedRecipient,
                  notes: notes.trim() || undefined,
                })
              ).unwrap();

              showToast('Bulk settlement completed successfully!', 'success');
              navigation.goBack();
            } catch (error) {
              ErrorHandler.handleError(error, showToast, 'Bulk Settlement');
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const groupMembers = selectedGroup?.members || [];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>
          Bulk Settlement
        </Text>
      </View>

      <Card style={styles.card}>
        <Card.Content>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
            Select Recipient
          </Text>
          <Text style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>
            All members will pay their total owed amounts to the selected recipient
          </Text>

          <RadioButton.Group
            onValueChange={setSelectedRecipient}
            value={selectedRecipient}
          >
            {groupMembers.map(member => (
              <RadioButton.Item
                key={member.user_id}
                label={member.user?.full_name || 'Unknown'}
                value={member.user_id}
                labelStyle={{ color: theme.colors.onSurface }}
              />
            ))}
          </RadioButton.Group>
        </Card.Content>
      </Card>

      {bulkSettlementSummary && bulkSettlementSummary.member_debts.length > 0 && (
        <Card style={styles.summaryCard}>
          <Card.Content>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
              Settlement Summary
            </Text>
            <View style={styles.totalContainer}>
              <Text style={[styles.totalLabel, { color: theme.colors.onSurfaceVariant }]}>
                Total Amount:
              </Text>
              <Text style={[styles.totalAmount, { color: theme.colors.primary }]}>
                ₹{bulkSettlementSummary.total_amount.toFixed(2)}
              </Text>
            </View>

            <Divider style={styles.divider} />

            <Text style={[styles.debtsTitle, { color: theme.colors.onSurface }]}>
              Members to Pay:
            </Text>
            {bulkSettlementSummary.member_debts.map(debt => (
              <View key={debt.user_id} style={styles.debtRow}>
                <Avatar.Text
                  size={40}
                  label={debt.user_name.substring(0, 2).toUpperCase()}
                />
                <View style={styles.debtInfo}>
                  <Text style={[styles.debtName, { color: theme.colors.onSurface }]}>
                    {debt.user_name}
                  </Text>
                  <Text style={[styles.debtDetails, { color: theme.colors.onSurfaceVariant }]}>
                    {debt.expense_count} expense{debt.expense_count !== 1 ? 's' : ''}
                  </Text>
                </View>
                <Text style={[styles.debtAmount, { color: theme.colors.error }]}>
                  ₹{debt.total_owed.toFixed(2)}
                </Text>
              </View>
            ))}
          </Card.Content>
        </Card>
      )}

      {bulkSettlementSummary && bulkSettlementSummary.member_debts.length === 0 && (
        <Card style={styles.card}>
          <Card.Content>
            <Text style={[styles.noDebtsText, { color: theme.colors.onSurfaceVariant }]}>
              No debts to settle. All expenses are already settled.
            </Text>
          </Card.Content>
        </Card>
      )}

      {bulkSettlementSummary && bulkSettlementSummary.member_debts.length > 0 && (
        <Card style={styles.card}>
          <Card.Content>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
              Notes (Optional)
            </Text>
            <TextInput
              label="Add a note for this bulk settlement"
              value={notes}
              onChangeText={setNotes}
              mode="outlined"
              multiline
              numberOfLines={3}
              style={styles.notesInput}
            />
          </Card.Content>
        </Card>
      )}

      {bulkSettlementSummary && bulkSettlementSummary.member_debts.length > 0 && (
        <Button
          mode="contained"
          onPress={handleBulkSettlement}
          loading={isSubmitting}
          disabled={isSubmitting || !selectedRecipient}
          style={styles.settleButton}
          icon="check-circle"
        >
          Process Bulk Settlement
        </Button>
      )}

      <LoadingOverlay visible={loading && !refreshing} message="Loading settlement summary..." />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  card: {
    marginBottom: 16,
  },
  summaryCard: {
    marginBottom: 16,
    backgroundColor: '#f5f5f5',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    marginBottom: 16,
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  divider: {
    marginVertical: 16,
  },
  debtsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  debtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  debtInfo: {
    flex: 1,
    marginLeft: 12,
  },
  debtName: {
    fontSize: 16,
    fontWeight: '500',
  },
  debtDetails: {
    fontSize: 12,
    marginTop: 2,
  },
  debtAmount: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  noDebtsText: {
    fontSize: 14,
    textAlign: 'center',
    padding: 16,
  },
  notesInput: {
    marginTop: 8,
  },
  settleButton: {
    marginTop: 16,
    marginBottom: 32,
  },
});

