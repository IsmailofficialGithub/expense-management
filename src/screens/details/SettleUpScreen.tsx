// src/screens/details/SettleUpScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Text, Card, Avatar, Button, TextInput, HelperText, RadioButton, Divider, Chip } from 'react-native-paper';
import { useGroups } from '../../hooks/useGroups';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useNetworkCheck } from '../../hooks/useNetworkCheck';
import { useAppDispatch } from '../../store';
import { fetchGroups, fetchGroupBalances } from '../../store/slices/groupsSlice';
import { settleUp } from '../../store/slices/expensesSlice';
import { ErrorHandler } from '../../utils/errorHandler';
import LoadingOverlay from '../../components/LoadingOverlay';
import SafeScrollView from '../../components/SafeScrollView';

interface Props {
  navigation: any;
  route?: {
    params?: {
      groupId?: string;
      userId?: string;
      suggestedAmount?: number;
    };
  };
}

export default function SettleUpScreen({ navigation, route }: Props) {
  const { groups, balances } = useGroups();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const { isOnline } = useNetworkCheck();
  const dispatch = useAppDispatch();

  const preSelectedGroupId = route?.params?.groupId;
  const preSelectedUserId = route?.params?.userId;
  const suggestedAmount = route?.params?.suggestedAmount;

  const [selectedGroupId, setSelectedGroupId] = useState(preSelectedGroupId || '');
  const [selectedUserId, setSelectedUserId] = useState(preSelectedUserId || '');
  const [amount, setAmount] = useState(suggestedAmount ? suggestedAmount.toString() : '');
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errors, setErrors] = useState({
    group: '',
    user: '',
    amount: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedGroupId) {
      dispatch(fetchGroupBalances(selectedGroupId));
    }
  }, [selectedGroupId]);

  const loadData = async () => {
    if (!isOnline) {
      showToast('Unable to load data. No internet connection.', 'error');
      return;
    }

    try {
      await dispatch(fetchGroups()).unwrap();
    } catch (error) {
      ErrorHandler.handleError(error, showToast, 'Load Groups');
    }
  };

  const validateForm = () => {
    const newErrors = {
      group: '',
      user: '',
      amount: '',
    };

    let isValid = true;

    if (!selectedGroupId) {
      newErrors.group = 'Please select a group';
      isValid = false;
    }

    if (!selectedUserId) {
      newErrors.user = 'Please select who you are paying';
      isValid = false;
    }

    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      newErrors.amount = 'Please enter a valid amount greater than 0';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSettleUp = async () => {
    if (!validateForm()) return;

    if (!isOnline) {
      showToast('Cannot settle up. No internet connection.', 'error');
      return;
    }

    const amountNum = parseFloat(amount);
    const selectedUser = getUsersToSettle().find(u => u.id === selectedUserId);

    Alert.alert(
      'Confirm Settlement',
      `Pay ₹${amountNum.toFixed(2)} to ${selectedUser?.name || 'user'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setIsProcessing(true);
            try {
              await dispatch(settleUp({
                group_id: selectedGroupId,
                from_user: profile!.id,
                to_user: selectedUserId,
                amount: amountNum,
                notes: notes.trim() || undefined,
              })).unwrap();

              showToast('Payment recorded successfully!', 'success');
              navigation.goBack();
            } catch (error) {
              ErrorHandler.handleError(error, showToast, 'Settle Up');
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };

  const getUsersToSettle = () => {
    if (!selectedGroupId) return [];

    const selectedGroup = groups.find(g => g.id === selectedGroupId);
    if (!selectedGroup?.members) return [];

    // Get balances for this group
    const groupBalances = balances.filter(b => b.group_id === selectedGroupId);

    // Get users I owe money to (negative balance)
    return selectedGroup.members
      .filter(m => m.user_id !== profile?.id)
      .map(m => {
        const balance = groupBalances.find(b => b.user_id === m.user_id);
        const myBalance = groupBalances.find(b => b.user_id === profile?.id);
        
        // Calculate how much I owe this user
        let oweAmount = 0;
        if (myBalance && myBalance.balance < 0) {
          // I owe money overall
          if (balance && balance.balance > 0) {
            // This user is owed money
            oweAmount = Math.min(Math.abs(myBalance.balance), balance.balance);
          }
        }

        return {
          id: m.user_id,
          name: m.user?.full_name || 'Unknown',
          email: m.user?.email || '',
          balance: balance?.balance || 0,
          oweAmount,
        };
      })
      .filter(u => u.oweAmount > 0)
      .sort((a, b) => b.oweAmount - a.oweAmount);
  };

  const getSelectedUserBalance = () => {
    const user = getUsersToSettle().find(u => u.id === selectedUserId);
    return user?.oweAmount || 0;
  };

  const selectedGroup = groups.find(g => g.id === selectedGroupId);
  const usersToSettle = getUsersToSettle();
  const selectedUserBalance = getSelectedUserBalance();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeScrollView contentContainerStyle={styles.content}>
        {/* Info Card */}
        <Card style={styles.infoCard}>
          <Card.Content>
            <View style={styles.infoHeader}>
              <Text style={styles.infoIcon}>💸</Text>
              <View style={styles.infoText}>
                <Text style={styles.infoTitle}>Settle Up</Text>
                <Text style={styles.infoDescription}>
                  Record a payment you made to a group member
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Group Selection */}
        <Text style={styles.sectionTitle}>Which group?</Text>
        {groups.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Card.Content>
              <Text style={styles.emptyText}>No groups available</Text>
              <Button
                mode="contained"
                onPress={() => navigation.navigate('Groups')}
                style={styles.emptyButton}
              >
                Create a Group
              </Button>
            </Card.Content>
          </Card>
        ) : (
          <Card style={styles.selectionCard}>
            <RadioButton.Group
              onValueChange={(value) => {
                setSelectedGroupId(value);
                setSelectedUserId(''); // Reset user selection
              }}
              value={selectedGroupId}
            >
              {groups.map((group) => (
                <React.Fragment key={group.id}>
                  <RadioButton.Item
                    label={group.name}
                    value={group.id}
                    position="leading"
                  />
                  <Divider />
                </React.Fragment>
              ))}
            </RadioButton.Group>
          </Card>
        )}
        {errors.group ? (
          <HelperText type="error" visible={!!errors.group}>
            {errors.group}
          </HelperText>
        ) : null}

        {/* User Selection */}
        {selectedGroupId && (
          <>
            <Text style={styles.sectionTitle}>Pay whom?</Text>
            {usersToSettle.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Card.Content>
                  <Text style={styles.emptyText}>
                    You don't owe anyone in this group
                  </Text>
                  <Text style={styles.emptySubtext}>
                    You're all settled up! 🎉
                  </Text>
                </Card.Content>
              </Card>
            ) : (
              <Card style={styles.selectionCard}>
                <RadioButton.Group
                  onValueChange={(value) => {
                    setSelectedUserId(value);
                    // Auto-fill suggested amount
                    const user = usersToSettle.find(u => u.id === value);
                    if (user) {
                      setAmount(user.oweAmount.toFixed(2));
                    }
                  }}
                  value={selectedUserId}
                >
                  {usersToSettle.map((user, index) => (
                    <React.Fragment key={user.id}>
                      {index > 0 && <Divider />}
                      <View style={styles.userItem}>
                        <RadioButton.Item
                          label=""
                          value={user.id}
                          position="leading"
                          style={styles.radioButton}
                        />
                        <View style={styles.userInfo}>
                          <Avatar.Text
                            size={40}
                            label={user.name.substring(0, 2).toUpperCase()}
                            style={styles.userAvatar}
                          />
                          <View style={styles.userDetails}>
                            <Text style={styles.userName}>{user.name}</Text>
                            <Text style={styles.userEmail}>{user.email}</Text>
                          </View>
                          <View style={styles.userBalance}>
                            <Text style={styles.balanceLabel}>You owe</Text>
                            <Text style={styles.balanceAmount}>
                              ₹{user.oweAmount.toFixed(2)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </React.Fragment>
                  ))}
                </RadioButton.Group>
              </Card>
            )}
            {errors.user ? (
              <HelperText type="error" visible={!!errors.user}>
                {errors.user}
              </HelperText>
            ) : null}
          </>
        )}

        {/* Amount Input */}
        {selectedUserId && (
          <>
            <Text style={styles.sectionTitle}>How much?</Text>
            <TextInput
              label="Amount *"
              value={amount}
              onChangeText={setAmount}
              mode="outlined"
              keyboardType="decimal-pad"
              placeholder="0.00"
              error={!!errors.amount}
              left={<TextInput.Affix text="₹" />}
              style={styles.input}
            />
            {errors.amount ? (
              <HelperText type="error" visible={!!errors.amount}>
                {errors.amount}
              </HelperText>
            ) : null}

            {selectedUserBalance > 0 && (
              <View style={styles.suggestionContainer}>
                <Text style={styles.suggestionText}>
                  Suggested amount: ₹{selectedUserBalance.toFixed(2)}
                </Text>
                <Button
                  mode="text"
                  onPress={() => setAmount(selectedUserBalance.toFixed(2))}
                  compact
                >
                  Use
                </Button>
              </View>
            )}

            {/* Quick Amount Buttons */}
            <View style={styles.quickAmounts}>
              {[100, 500, 1000, 2000].map((quickAmount) => (
                <Chip
                  key={quickAmount}
                  selected={parseFloat(amount) === quickAmount}
                  onPress={() => setAmount(quickAmount.toString())}
                  style={styles.quickAmountChip}
                >
                  ₹{quickAmount}
                </Chip>
              ))}
            </View>
          </>
        )}

        {/* Notes */}
        {selectedUserId && (
          <>
            <Text style={styles.sectionTitle}>Notes (Optional)</Text>
            <TextInput
              label="Add a note"
              value={notes}
              onChangeText={setNotes}
              mode="outlined"
              multiline
              numberOfLines={3}
              placeholder="e.g., Cash payment, Bank transfer..."
              style={styles.input}
            />
          </>
        )}

        {/* Summary */}
        {selectedUserId && amount && parseFloat(amount) > 0 && (
          <Card style={styles.summaryCard}>
            <Card.Content>
              <Text style={styles.summaryTitle}>Payment Summary</Text>
              <Divider style={styles.summaryDivider} />
              
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>From</Text>
                <Text style={styles.summaryValue}>You</Text>
              </View>
              
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>To</Text>
                <Text style={styles.summaryValue}>
                  {usersToSettle.find(u => u.id === selectedUserId)?.name}
                </Text>
              </View>
              
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Amount</Text>
                <Text style={styles.summaryAmount}>₹{parseFloat(amount).toFixed(2)}</Text>
              </View>
              
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Group</Text>
                <Text style={styles.summaryValue}>{selectedGroup?.name}</Text>
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Submit Button */}
        {selectedUserId && (
          <Button
            mode="contained"
            onPress={handleSettleUp}
            loading={isProcessing}
            disabled={isProcessing}
            style={styles.submitButton}
            contentStyle={styles.submitButtonContent}
            icon="check"
          >
            Record Payment
          </Button>
        )}
      </SafeScrollView>

      <LoadingOverlay visible={isProcessing} message="Recording payment..." />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  infoCard: {
    marginBottom: 24,
    backgroundColor: '#E8F5E9',
    elevation: 2,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoIcon: {
    fontSize: 48,
    marginRight: 16,
  },
  infoText: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginBottom: 4,
  },
  infoDescription: {
    fontSize: 14,
    color: '#558B2F',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 12,
  },
  selectionCard: {
    backgroundColor: '#fff',
    elevation: 2,
    marginBottom: 8,
  },
  emptyCard: {
    backgroundColor: '#fff',
    elevation: 2,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyButton: {
    alignSelf: 'center',
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingRight: 16,
  },
  radioButton: {
    paddingVertical: 0,
  },
  userInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatar: {
    backgroundColor: '#6200EE',
    marginRight: 12,
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  userEmail: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  userBalance: {
    alignItems: 'flex-end',
  },
  balanceLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 2,
  },
  balanceAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F44336',
  },
  input: {
    marginBottom: 8,
  },
  suggestionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#E8DEF8',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  suggestionText: {
    fontSize: 14,
    color: '#6200EE',
    fontWeight: '500',
  },
  quickAmounts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  quickAmountChip: {
    flex: 1,
    minWidth: 70,
  },
  summaryCard: {
    backgroundColor: '#FFF3E0',
    elevation: 2,
    marginTop: 16,
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#E65100',
    marginBottom: 8,
  },
  summaryDivider: {
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  summaryAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#E65100',
  },
  submitButton: {
    marginTop: 24,
  },
  submitButtonContent: {
    paddingVertical: 8,
  },
});