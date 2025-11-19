// src/screens/details/ExpenseDetailsScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Image, Alert, Dimensions } from 'react-native';
import { Text, Card, Avatar, Button, IconButton, Chip, Divider, List, Portal, Modal } from 'react-native-paper';
import { useExpenses } from '../../hooks/useExpenses';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useNetworkCheck } from '../../hooks/useNetworkCheck';
import { useAppDispatch } from '../../store';
import { fetchExpense, deleteExpense, updateExpense } from '../../store/slices/expensesSlice';
import { ErrorHandler } from '../../utils/errorHandler';
import LoadingOverlay from '../../components/LoadingOverlay';
import { format } from 'date-fns';
import SafeScrollView from '../../components/SafeScrollView';

const { width } = Dimensions.get('window');

interface Props {
  navigation: any;
  route: {
    params: {
      expenseId: string;
    };
  };
}

export default function ExpenseDetailsScreen({ navigation, route }: Props) {
  const { expenseId } = route.params;
  const { selectedExpense, loading } = useExpenses();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const { isOnline } = useNetworkCheck();
  const dispatch = useAppDispatch();

  const [isProcessing, setIsProcessing] = useState(false);
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);

  useEffect(() => {
    loadExpenseData();
  }, [expenseId]);

  const loadExpenseData = async () => {
    if (!isOnline) {
      showToast('Unable to load expense. No internet connection.', 'error');
      return;
    }

    try {
      await dispatch(fetchExpense(expenseId)).unwrap();
    } catch (error) {
      ErrorHandler.handleError(error, showToast, 'Load Expense Details');
      navigation.goBack();
    }
  };

  const handleDeleteExpense = () => {
    Alert.alert(
      'Delete Expense',
      'Are you sure you want to delete this expense? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!isOnline) {
              showToast('Cannot delete expense. No internet connection.', 'error');
              return;
            }

            setIsProcessing(true);
            try {
              await dispatch(deleteExpense(expenseId)).unwrap();
              showToast('Expense deleted successfully', 'success');
              navigation.goBack();
            } catch (error) {
              ErrorHandler.handleError(error, showToast, 'Delete Expense');
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleEditExpense = () => {
    if (!isOnline) {
      showToast('Cannot edit expense. No internet connection.', 'error');
      return;
    }

    navigation.navigate('EditExpense', { expenseId });
  };

  const handleMarkAsSettled = async (splitId: string) => {
    if (!isOnline) {
      showToast('Cannot update expense. No internet connection.', 'error');
      return;
    }

    Alert.alert(
      'Mark as Settled',
      'Mark this split as settled?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Settled',
          onPress: async () => {
            setIsProcessing(true);
            try {
              // TODO: Implement mark split as settled
              showToast('Split marked as settled', 'success');
              await loadExpenseData();
            } catch (error) {
              ErrorHandler.handleError(error, showToast, 'Mark as Settled');
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };

  if (!selectedExpense) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingOverlay visible={true} message="Loading expense..." />
      </View>
    );
  }

  const isPaidByMe = selectedExpense.paid_by === profile?.id;
  const mySplit = selectedExpense.splits?.find(s => s.user_id === profile?.id);
  const myShare = mySplit ? Number(mySplit.amount) : 0;
  const totalAmount = Number(selectedExpense.amount);
  const allSettled = selectedExpense.splits?.every(s => s.is_settled) || false;

  return (
    <View style={styles.container}>
      <SafeScrollView contentContainerStyle={styles.content} hasTabBar={false}>
        {/* Expense Header */}
        <Card style={styles.headerCard}>
          <Card.Content>
            <View style={styles.header}>
              <Text style={styles.categoryIcon}>
                {selectedExpense.category?.icon || '💰'}
              </Text>
              <View style={styles.headerText}>
                <Text style={styles.description}>{selectedExpense.description}</Text>
                <Chip
                  mode="flat"
                  style={styles.categoryChip}
                  textStyle={styles.categoryChipText}
                >
                  {selectedExpense.category?.name || 'Other'}
                </Chip>
              </View>
            </View>

            <Divider style={styles.divider} />

            <View style={styles.amountSection}>
              <View style={styles.amountRow}>
                <Text style={styles.label}>Total Amount</Text>
                <Text style={styles.totalAmount}>₹{totalAmount.toFixed(2)}</Text>
              </View>
              <View style={styles.amountRow}>
                <Text style={styles.label}>Your Share</Text>
                <Text
                  style={[
                    styles.yourShare,
                    isPaidByMe ? styles.positiveAmount : styles.negativeAmount,
                  ]}
                >
                  {isPaidByMe ? '+' : '-'}₹{myShare.toFixed(2)}
                </Text>
              </View>
            </View>

            {allSettled && (
              <Chip icon="check-circle" style={styles.settledChip} textStyle={styles.settledText}>
                All Settled
              </Chip>
            )}
          </Card.Content>
        </Card>

        {/* Expense Details */}
        <Card style={styles.detailsCard}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Details</Text>

            <List.Item
              title="Paid By"
              description={
                isPaidByMe
                  ? 'You'
                  : selectedExpense.paid_by_user?.full_name || 'Unknown'
              }
              left={(props) => <List.Icon {...props} icon="account" />}
            />
            <Divider />

            <List.Item
              title="Date"
              description={format(new Date(selectedExpense.date), 'MMMM dd, yyyy')}
              left={(props) => <List.Icon {...props} icon="calendar" />}
            />
            <Divider />

            <List.Item
              title="Split Type"
              description={
                selectedExpense.split_type === 'equal'
                  ? 'Split Equally'
                  : 'Custom Split'
              }
              left={(props) => <List.Icon {...props} icon="chart-pie" />}
            />

            {selectedExpense.notes && (
              <>
                <Divider />
                <List.Item
                  title="Notes"
                  description={selectedExpense.notes}
                  left={(props) => <List.Icon {...props} icon="note-text" />}
                />
              </>
            )}

            {selectedExpense.receipt_url && (
              <>
                <Divider />
                <List.Item
                  title="Receipt"
                  description="Tap to view"
                  left={(props) => <List.Icon {...props} icon="receipt" />}
                  right={(props) => <List.Icon {...props} icon="chevron-right" />}
                  onPress={() => setReceiptModalVisible(true)}
                />
              </>
            )}
          </Card.Content>
        </Card>

        {/* Split Details */}
        <Card style={styles.splitsCard}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Split Between</Text>

            {selectedExpense.splits?.map((split, index) => {
              const user = split.user;
              const isCurrentUser = split.user_id === profile?.id;
              const splitAmount = Number(split.amount);
              const splitPercentage = ((splitAmount / totalAmount) * 100).toFixed(0);

              return (
                <React.Fragment key={split.id}>
                  {index > 0 && <Divider />}
                  <View style={styles.splitItem}>
                    <View style={styles.splitLeft}>
                      <Avatar.Text
                        size={40}
                        label={user?.full_name?.substring(0, 2).toUpperCase() || 'U'}
                        style={styles.splitAvatar}
                      />
                      <View style={styles.splitInfo}>
                        <Text style={styles.splitName}>
                          {user?.full_name || 'Unknown'}
                          {isCurrentUser && ' (You)'}
                        </Text>
                        <Text style={styles.splitPercentage}>{splitPercentage}% of total</Text>
                      </View>
                    </View>

                    <View style={styles.splitRight}>
                      <Text style={styles.splitAmount}>₹{splitAmount.toFixed(2)}</Text>
                      {split.is_settled ? (
                        <Chip
                          icon="check"
                          style={styles.settledBadge}
                          textStyle={styles.settledBadgeText}
                          compact
                        >
                          Settled
                        </Chip>
                      ) : isPaidByMe && !isCurrentUser ? (
                        <Button
                          mode="text"
                          onPress={() => handleMarkAsSettled(split.id)}
                          compact
                        >
                          Mark Settled
                        </Button>
                      ) : (
                        <Chip
                          style={styles.pendingBadge}
                          textStyle={styles.pendingBadgeText}
                          compact
                        >
                          Pending
                        </Chip>
                      )}
                    </View>
                  </View>
                </React.Fragment>
              );
            })}
          </Card.Content>
        </Card>

        {/* Action Buttons */}
        {isPaidByMe && (
          <View style={styles.actions}>
            <Button
              mode="outlined"
              icon="pencil"
              onPress={handleEditExpense}
              style={styles.actionButton}
            >
              Edit
            </Button>
            <Button
              mode="outlined"
              icon="delete"
              onPress={handleDeleteExpense}
              style={styles.deleteButton}
              textColor="#F44336"
            >
              Delete
            </Button>
          </View>
        )}

        {/* Created Info */}
        <Text style={styles.createdText}>
          Created on {format(new Date(selectedExpense.created_at), 'MMM dd, yyyy HH:mm')}
        </Text>
      </SafeScrollView>

      {/* Receipt Modal */}
      <Portal>
        <Modal
          visible={receiptModalVisible}
          onDismiss={() => setReceiptModalVisible(false)}
          contentContainerStyle={styles.receiptModal}
        >
          <View style={styles.receiptHeader}>
            <Text style={styles.receiptTitle}>Receipt</Text>
            <IconButton
              icon="close"
              size={24}
              onPress={() => setReceiptModalVisible(false)}
            />
          </View>
          {selectedExpense.receipt_url && (
            <Image
              source={{ uri: selectedExpense.receipt_url }}
              style={styles.receiptImage}
              resizeMode="contain"
            />
          )}
        </Modal>
      </Portal>

      <LoadingOverlay visible={isProcessing} message="Processing..." />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  headerCard: {
    marginBottom: 16,
    backgroundColor: '#fff',
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  categoryIcon: {
    fontSize: 48,
    marginRight: 16,
  },
  headerText: {
    flex: 1,
  },
  description: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  categoryChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8DEF8',
  },
  categoryChipText: {
    fontSize: 12,
    color: '#6200EE',
  },
  divider: {
    marginVertical: 16,
  },
  amountSection: {
    gap: 12,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    color: '#666',
  },
  totalAmount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  yourShare: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  positiveAmount: {
    color: '#4CAF50',
  },
  negativeAmount: {
    color: '#F44336',
  },
  settledChip: {
    alignSelf: 'flex-start',
    marginTop: 16,
    backgroundColor: '#C8E6C9',
  },
  settledText: {
    color: '#2E7D32',
    fontWeight: '600',
  },
  detailsCard: {
    marginBottom: 16,
    backgroundColor: '#fff',
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  splitsCard: {
    marginBottom: 16,
    backgroundColor: '#fff',
    elevation: 2,
  },
  splitItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  splitLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  splitAvatar: {
    backgroundColor: '#6200EE',
  },
  splitInfo: {
    marginLeft: 12,
    flex: 1,
  },
  splitName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  splitPercentage: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  splitRight: {
    alignItems: 'flex-end',
  },
  splitAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  settledBadge: {
    height: 24,
    backgroundColor: '#C8E6C9',
  },
  settledBadgeText: {
    fontSize: 11,
    color: '#2E7D32',
  },
  pendingBadge: {
    height: 24,
    backgroundColor: '#FFE0B2',
  },
  pendingBadgeText: {
    fontSize: 11,
    color: '#E65100',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
  },
  deleteButton: {
    flex: 1,
    borderColor: '#F44336',
  },
  createdText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  receiptModal: {
    backgroundColor: 'white',
    margin: 20,
    borderRadius: 8,
    maxHeight: '80%',
  },
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  receiptTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  receiptImage: {
    width: width - 40,
    height: 400,
    alignSelf: 'center',
  },
});