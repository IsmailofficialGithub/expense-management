// src/screens/details/GroupDetailsScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Alert } from 'react-native';
import { Text, Card, Avatar, Button, IconButton, Chip, Divider, FAB, Portal, Modal, TextInput, HelperText, List } from 'react-native-paper';
import { useGroups } from '../../hooks/useGroups';
import { useExpenses } from '../../hooks/useExpenses';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useNetworkCheck } from '../../hooks/useNetworkCheck';
import { useAppDispatch } from '../../store';
import { fetchGroup, fetchGroupBalances, updateGroup, deleteGroup, addGroupMember, removeGroupMember } from '../../store/slices/groupsSlice';
import { fetchExpenses } from '../../store/slices/expensesSlice';
import { ErrorHandler } from '../../utils/errorHandler';
import LoadingOverlay from '../../components/LoadingOverlay';
import { format } from 'date-fns';
import SafeScrollView from '../../components/SafeScrollView';
import { useTheme } from 'react-native-paper';

interface Props {
  navigation: any;
  route: {
    params: {
      groupId: string;
    };
  };
}

export default function GroupDetailsScreen({ navigation, route }: Props) {
  const { groupId } = route.params;
  const theme = useTheme();
  const { selectedGroup, balances, loading } = useGroups();
  const { expenses } = useExpenses();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const { isOnline } = useNetworkCheck();
  const dispatch = useAppDispatch();

  const [refreshing, setRefreshing] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [addMemberModalVisible, setAddMemberModalVisible] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [errors, setErrors] = useState({ name: '', email: '' });
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadGroupData();
  }, [groupId]);

  useEffect(() => {
    if (selectedGroup) {
      setGroupName(selectedGroup.name);
      setGroupDescription(selectedGroup.description || '');
    }
  }, [selectedGroup]);

  const loadGroupData = async () => {
    if (!isOnline) {
      showToast('Unable to load group data. No internet connection.', 'error');
      return;
    }

    try {
      await Promise.all([
        dispatch(fetchGroup(groupId)).unwrap(),
        dispatch(fetchGroupBalances(groupId)).unwrap(),
        dispatch(fetchExpenses({ group_id: groupId })).unwrap(),
      ]);
    } catch (error) {
      ErrorHandler.handleError(error, showToast, 'Load Group Details');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadGroupData();
    setRefreshing(false);
  };

  const handleUpdateGroup = async () => {
    setErrors({ name: '', email: '' });

    if (!groupName.trim()) {
      setErrors(prev => ({ ...prev, name: 'Group name is required' }));
      return;
    }

    if (!isOnline) {
      showToast('Cannot update group. No internet connection.', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      await dispatch(updateGroup({
        groupId,
        updates: {
          name: groupName.trim(),
          description: groupDescription.trim() || null,
        },
      })).unwrap();

      setEditModalVisible(false);
      showToast('Group updated successfully!', 'success');
    } catch (error) {
      ErrorHandler.handleError(error, showToast, 'Update Group');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteGroup = () => {
    Alert.alert(
      'Delete Group',
      'Are you sure you want to delete this group? This will also delete all expenses in this group.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!isOnline) {
              showToast('Cannot delete group. No internet connection.', 'error');
              return;
            }

            setIsProcessing(true);
            try {
              await dispatch(deleteGroup(groupId)).unwrap();
              showToast('Group deleted successfully', 'success');
              navigation.goBack();
            } catch (error) {
              ErrorHandler.handleError(error, showToast, 'Delete Group');
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleAddMember = async () => {
    setErrors({ name: '', email: '' });

    if (!memberEmail.trim()) {
      setErrors(prev => ({ ...prev, email: 'Email is required' }));
      return;
    }

    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(memberEmail)) {
      setErrors(prev => ({ ...prev, email: 'Invalid email format' }));
      return;
    }

    if (!isOnline) {
      showToast('Cannot add member. No internet connection.', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      // In real app, you'd search for user by email first
      // For now, we'll show a message
      showToast('Member invitation feature coming soon!', 'info');
      setAddMemberModalVisible(false);
      setMemberEmail('');
    } catch (error) {
      ErrorHandler.handleError(error, showToast, 'Add Member');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveMember = (userId: string, userName: string) => {
    Alert.alert(
      'Remove Member',
      `Remove ${userName} from this group?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (!isOnline) {
              showToast('Cannot remove member. No internet connection.', 'error');
              return;
            }

            setIsProcessing(true);
            try {
              await dispatch(removeGroupMember({ groupId, userId })).unwrap();
              showToast('Member removed successfully', 'success');
            } catch (error) {
              ErrorHandler.handleError(error, showToast, 'Remove Member');
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };

  if (!selectedGroup) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingOverlay visible={true} message="Loading group..." />
      </View>
    );
  }

  const isAdmin = selectedGroup.created_by === profile?.id;
  const groupExpenses = expenses.filter(e => e.group_id === groupId);
  const totalSpent = groupExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
  const myBalance = balances.find(b => b.user_id === profile?.id);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <SafeScrollView
        contentContainerStyle={styles.content}
        hasTabBar={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Group Header */}
        <Card style={styles.headerCard}>
          <Card.Content>
            <View style={styles.headerContent}>
              <Avatar.Text
                size={64}
                label={selectedGroup.name.substring(0, 2).toUpperCase()}
                style={styles.avatar}
              />
              <View style={styles.headerText}>
                <Text style={[styles.groupName, { color: theme.colors.onSurface }]}>{selectedGroup.name}</Text>
                {selectedGroup.description && (
                  <Text style={[styles.groupDescription, { color: theme.colors.onSurfaceVariant }]}>
                    {selectedGroup.description}
                  </Text>
                )}
                <View style={styles.badges}>
                  <Chip icon="account-group" style={styles.badge}>
                    {selectedGroup.members?.length || 0} members
                  </Chip>
                  {isAdmin && (
                    <Chip icon="crown" style={styles.adminBadge}>
                      Admin
                    </Chip>
                  )}
                </View>
              </View>
            </View>

            {isAdmin && (
              <View style={styles.adminActions}>
                <Button
                  mode="outlined"
                  icon="pencil"
                  onPress={() => setEditModalVisible(true)}
                  style={styles.adminButton}
                  compact
                >
                  Edit
                </Button>
                <Button
                  mode="outlined"
                  icon="delete"
                  onPress={handleDeleteGroup}
                  style={styles.deleteButton}
                  textColor="#F44336"
                  compact
                >
                  Delete
                </Button>
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Balance Summary */}
        <Card style={styles.balanceCard}>
          <Card.Content>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Your Balance</Text>
            <View style={styles.balanceRow}>
              <View style={styles.balanceItem}>
                <Text style={[styles.balanceLabel, { color: theme.colors.onSurfaceVariant }]}>Total Spent</Text>
                <Text style={[styles.balanceAmount, { color: theme.colors.onSurface }]}>₹{totalSpent.toFixed(2)}</Text>
              </View>
              <View style={styles.balanceItem}>
                <Text style={[styles.balanceLabel, { color: theme.colors.onSurfaceVariant }]}>Your Balance</Text>
                <Text
                  style={[
                    styles.balanceAmount,
                    myBalance && myBalance.balance > 0
                      ? styles.positiveBalance
                      : myBalance && myBalance.balance < 0
                      ? styles.negativeBalance
                      : styles.neutralBalance,
                  ]}
                >
                  {myBalance ? `₹${myBalance.balance.toFixed(2)}` : '₹0.00'}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Members Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Members</Text>
           <View style={{display: 'flex', flexDirection: 'row'}}>
             {isAdmin && (
              <IconButton
                icon="account-plus"
                size={24}
                onPress={() => setAddMemberModalVisible(true)}
              />
            )}
              <IconButton
                icon="account-plus"
                size={24}
                onPress={() => navigation.navigate('InviteUser', { groupId })}
              />
           </View>
          </View>

          {selectedGroup.members?.map((member) => {
            const memberBalance = balances.find(b => b.user_id === member.user_id);
            const isCurrentUser = member.user_id === profile?.id;

            return (
              <Card key={member.id} style={styles.memberCard}>
                <Card.Content style={styles.memberContent}>
                  <View style={styles.memberLeft}>
                    <Avatar.Text
                      size={40}
                      label={member.user?.full_name?.substring(0, 2).toUpperCase() || 'U'}
                    />
                    <View style={styles.memberInfo}>
                      <Text style={[styles.memberName, { color: theme.colors.onSurface }]}>
                        {member.user?.full_name || 'Unknown'}
                        {isCurrentUser && ' (You)'}
                      </Text>
                      <Text style={[styles.memberEmail, { color: theme.colors.onSurfaceVariant }]}>{member.user?.email}</Text>
                    </View>
                  </View>

                  <View style={styles.memberRight}>
                    {memberBalance && (
                      <Text
                        style={[
                          styles.memberBalance,
                          memberBalance.balance > 0
                            ? styles.positiveBalance
                            : memberBalance.balance < 0
                            ? styles.negativeBalance
                            : styles.neutralBalance,
                        ]}
                      >
                        ₹{memberBalance.balance.toFixed(2)}
                      </Text>
                    )}
                    {isAdmin && !isCurrentUser && (
                      <IconButton
                        icon="close"
                        size={20}
                        onPress={() =>
                          handleRemoveMember(member.user_id, member.user?.full_name || 'User')
                        }
                      />
                    )}
                  </View>
                </Card.Content>
              </Card>
            );
          })}
        </View>

        {/* Recent Expenses */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Recent Expenses</Text>
            <Button
              mode="text"
              onPress={() => navigation.navigate('Expenses', { groupId })}
              compact
            >
              View All
            </Button>
          </View>

          {groupExpenses.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Card.Content style={styles.emptyContent}>
                <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>No expenses yet</Text>
                <Text style={[styles.emptySubtext, { color: theme.colors.onSurfaceDisabled }]}>
                  Add your first expense to get started
                </Text>
              </Card.Content>
            </Card>
          ) : (
            groupExpenses.slice(0, 5).map((expense) => (
              <Card
                key={expense.id}
                style={styles.expenseCard}
                onPress={() => {
                  // TODO: Navigate to expense details
                  console.log('View expense:', expense.id);
                }}
              >
                <Card.Content style={styles.expenseContent}>
                  <View style={styles.expenseLeft}>
                    <Text style={styles.categoryIcon}>{expense.category?.icon || '💰'}</Text>
                    <View style={styles.expenseInfo}>
                      <Text style={[styles.expenseDescription, { color: theme.colors.onSurface }]}>
                        {expense.description}
                      </Text>
                      <Text style={[styles.expenseDate, { color: theme.colors.onSurfaceVariant }]}>
                        {format(new Date(expense.date), 'MMM dd, yyyy')}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.expenseRight}>
                    <Text style={[styles.expenseAmount, { color: theme.colors.onSurface }]}>₹{expense.amount}</Text>
                    <Text style={[styles.expensePaidBy, { color: theme.colors.onSurfaceVariant }]}>
                      {expense.paid_by === profile?.id
                        ? 'You paid'
                        : `${expense.paid_by_user?.full_name || 'Someone'} paid`}
                    </Text>
                  </View>
                </Card.Content>
              </Card>
            ))
          )}
        </View>
      </SafeScrollView>

      {/* Floating Action Buttons */}
      <View style={styles.fabContainer}>
        <FAB
          icon="food"
          style={[styles.fab, styles.fabSecondary, styles.fabSpacing]}
          onPress={() => {
            navigation.navigate('AddFoodExpense', { groupId });
          }}
          size="small"
        />
        <FAB
          icon="plus"
          style={styles.fab}
          onPress={() => {
            navigation.navigate('AddExpense', { groupId });
          }}
          size="small"
        />
      </View>

      {/* Edit Group Modal */}
      <Portal>
        <Modal
          visible={editModalVisible}
          onDismiss={() => setEditModalVisible(false)}
          contentContainerStyle={[styles.modalContent, { backgroundColor: theme.colors.surface }]}
        >
          <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>Edit Group</Text>

          <TextInput
            label="Group Name *"
            value={groupName}
            onChangeText={setGroupName}
            mode="outlined"
            error={!!errors.name}
            style={styles.input}
          />
          {errors.name ? (
            <HelperText type="error" visible={!!errors.name}>
              {errors.name}
            </HelperText>
          ) : null}

          <TextInput
            label="Description"
            value={groupDescription}
            onChangeText={setGroupDescription}
            mode="outlined"
            multiline
            numberOfLines={3}
            style={styles.input}
          />

          <View style={styles.modalActions}>
            <Button
              mode="outlined"
              onPress={() => setEditModalVisible(false)}
              style={styles.modalButton}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleUpdateGroup}
              style={styles.modalButton}
              loading={isProcessing}
              disabled={isProcessing}
            >
              Save
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* Add Member Modal */}
      <Portal>
        <Modal
          visible={addMemberModalVisible}
          onDismiss={() => setAddMemberModalVisible(false)}
          contentContainerStyle={[styles.modalContent, { backgroundColor: theme.colors.surface }]}
        >
          <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>Add Member</Text>

          <TextInput
            label="Email Address *"
            value={memberEmail}
            onChangeText={setMemberEmail}
            mode="outlined"
            keyboardType="email-address"
            autoCapitalize="none"
            error={!!errors.email}
            style={styles.input}
            placeholder="member@example.com"
          />
          {errors.email ? (
            <HelperText type="error" visible={!!errors.email}>
              {errors.email}
            </HelperText>
          ) : null}

          <View style={styles.modalActions}>
            <Button
              mode="outlined"
              onPress={() => {
                setAddMemberModalVisible(false);
                setMemberEmail('');
              }}
              style={styles.modalButton}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleAddMember}
              style={styles.modalButton}
              loading={isProcessing}
              disabled={isProcessing}
            >
              Add
            </Button>
          </View>
        </Modal>
      </Portal>

      <LoadingOverlay visible={isProcessing} message="Processing..." />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 16,
    paddingBottom: 80,
  },
  headerCard: {
    marginBottom: 16,
    elevation: 2,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    backgroundColor: '#6200EE',
  },
  headerText: {
    flex: 1,
    marginLeft: 16,
  },
  groupName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  groupDescription: {
    fontSize: 14,
    marginBottom: 8,
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    height: 28,
    backgroundColor: '#E8DEF8',
  },
  adminBadge: {
    height: 28,
    backgroundColor: '#FFE082',
  },
  adminActions: {
    flexDirection: 'row',
    gap: 8,
  },
  adminButton: {
    flex: 1,
  },
  deleteButton: {
    flex: 1,
    borderColor: '#F44336',
  },
  balanceCard: {
    marginBottom: 16,
    elevation: 2,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
  },
  balanceItem: {
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  balanceAmount: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  positiveBalance: {
    color: '#4CAF50',
  },
  negativeBalance: {
    color: '#F44336',
  },
  neutralBalance: {
    color: '#666',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  memberCard: {
    marginBottom: 8,
    elevation: 2,
  },
  memberContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  memberLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  memberInfo: {
    marginLeft: 12,
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
  },
  memberEmail: {
    fontSize: 12,
    marginTop: 2,
  },
  memberRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberBalance: {
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 8,
  },
  expenseCard: {
    marginBottom: 8,
    elevation: 2,
  },
  expenseContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  expenseLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  expenseInfo: {
    flex: 1,
  },
  expenseDescription: {
    fontSize: 16,
    fontWeight: '500',
  },
  expenseDate: {
    fontSize: 12,
    marginTop: 2,
  },
  expenseRight: {
    alignItems: 'flex-end',
  },
  expenseAmount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  expensePaidBy: {
    fontSize: 12,
    marginTop: 2,
  },
  emptyCard: {
  },
  emptyContent: {
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
  },
  fabContainer: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    alignItems: 'flex-end',
  },
  fab: {
    backgroundColor: '#6200EE',
  },
  fabSecondary: {
    backgroundColor: '#4CAF50',
  },
  fabSpacing: {
    marginBottom: 12,
  },
  modalContent: {
    padding: 24,
    margin: 20,
    borderRadius: 8,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  input: {
    marginBottom: 8,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  modalButton: {
    minWidth: 100,
  },
});