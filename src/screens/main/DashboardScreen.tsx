// src/screens/main/DashboardScreen.tsx
import React, { useEffect } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Text, Card, Avatar, Button, Divider, IconButton } from 'react-native-paper';
import { useAuth } from '../../hooks/useAuth';
import { useGroups } from '../../hooks/useGroups';
import { useExpenses } from '../../hooks/useExpenses';
import { useAppDispatch } from '../../store';
import { fetchGroups } from '../../store/slices/groupsSlice';
import { fetchExpenses } from '../../store/slices/expensesSlice';
import { format } from 'date-fns';

export default function DashboardScreen({ navigation }: any) {
  const { profile } = useAuth();
  const { groups, loading: groupsLoading } = useGroups();
  const { expenses, loading: expensesLoading } = useExpenses();
  const dispatch = useAppDispatch();

  const [refreshing, setRefreshing] = React.useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await Promise.all([
      dispatch(fetchGroups()),
      dispatch(fetchExpenses()),
    ]);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Calculate statistics
  const totalExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
  const myExpenses = expenses.filter(exp => exp.paid_by === profile?.id);
  const totalPaidByMe = myExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
  
  // Calculate total I owe (sum of my splits where I'm not the payer)
  const totalIOwe = expenses.reduce((sum, exp) => {
    if (exp.paid_by !== profile?.id) {
      const mySplit = exp.splits?.find(s => s.user_id === profile?.id);
      return sum + Number(mySplit?.amount || 0);
    }
    return sum;
  }, 0);

  // Calculate total owed to me (sum of others' splits on expenses I paid)
  const totalOwedToMe = myExpenses.reduce((sum, exp) => {
    const othersOweMeForThisExpense = exp.splits
      ?.filter(s => s.user_id !== profile?.id)
      .reduce((splitSum, split) => splitSum + Number(split.amount), 0) || 0;
    return sum + othersOweMeForThisExpense;
  }, 0);

  const netBalance = totalOwedToMe - totalIOwe;

  // Get recent expenses (last 5)
  const recentExpenses = expenses.slice(0, 5);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Welcome Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.greeting}>Hello,</Text>
            <Text style={styles.userName}>{profile?.full_name || 'User'} 👋</Text>
          </View>
          <Avatar.Text 
            size={48} 
            label={profile?.full_name?.substring(0, 2).toUpperCase() || 'U'} 
            style={styles.avatar}
          />
        </View>
      </View>

      {/* Balance Overview Card */}
      <Card style={styles.balanceCard}>
        <Card.Content>
          <Text style={styles.balanceLabel}>Net Balance</Text>
          <Text style={[
            styles.balanceAmount,
            netBalance > 0 ? styles.positiveBalance : netBalance < 0 ? styles.negativeBalance : styles.neutralBalance
          ]}>
            {netBalance > 0 ? '+' : ''} ₹{Math.abs(netBalance).toFixed(2)}
          </Text>
          <Text style={styles.balanceDescription}>
            {netBalance > 0 
              ? "You're owed money overall" 
              : netBalance < 0 
              ? "You owe money overall" 
              : "You're all settled up!"}
          </Text>
        </Card.Content>
      </Card>

      {/* Quick Stats */}
      <View style={styles.statsContainer}>
        <Card style={styles.statCard}>
          <Card.Content style={styles.statContent}>
            <IconButton icon="cash" size={24} iconColor="#4CAF50" />
            <Text style={styles.statValue}>₹{totalPaidByMe.toFixed(0)}</Text>
            <Text style={styles.statLabel}>You Paid</Text>
          </Card.Content>
        </Card>

        <Card style={styles.statCard}>
          <Card.Content style={styles.statContent}>
            <IconButton icon="arrow-up" size={24} iconColor="#F44336" />
            <Text style={styles.statValue}>₹{totalIOwe.toFixed(0)}</Text>
            <Text style={styles.statLabel}>You Owe</Text>
          </Card.Content>
        </Card>

        <Card style={styles.statCard}>
          <Card.Content style={styles.statContent}>
            <IconButton icon="arrow-down" size={24} iconColor="#2196F3" />
            <Text style={styles.statValue}>₹{totalOwedToMe.toFixed(0)}</Text>
            <Text style={styles.statLabel}>Owed to You</Text>
          </Card.Content>
        </Card>
      </View>

      {/* My Groups Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Groups</Text>
          <Button 
            mode="text" 
            onPress={() => navigation.navigate('Groups')}
            compact
          >
            View All
          </Button>
        </View>

        {groups.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Card.Content style={styles.emptyContent}>
              <IconButton icon="account-group" size={48} iconColor="#999" />
              <Text style={styles.emptyText}>No groups yet</Text>
              <Button 
                mode="contained" 
                onPress={() => navigation.navigate('Groups')}
                style={styles.emptyButton}
              >
                Create Your First Group
              </Button>
            </Card.Content>
          </Card>
        ) : (
          groups.slice(0, 3).map((group) => (
            <Card 
              key={group.id} 
              style={styles.groupCard}
              onPress={() => {/* Navigate to group details */}}
            >
              <Card.Content style={styles.groupContent}>
                <View style={styles.groupInfo}>
                  <Avatar.Text 
                    size={40} 
                    label={group.name.substring(0, 2).toUpperCase()} 
                  />
                  <View style={styles.groupText}>
                    <Text style={styles.groupName}>{group.name}</Text>
                    <Text style={styles.groupMembers}>
                      {group.members?.length || 0} members
                    </Text>
                  </View>
                </View>
                <IconButton icon="chevron-right" size={24} />
              </Card.Content>
            </Card>
          ))
        )}
      </View>

      {/* Recent Activity */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <Button 
            mode="text" 
            onPress={() => navigation.navigate('Expenses')}
            compact
          >
            View All
          </Button>
        </View>

        {recentExpenses.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Card.Content style={styles.emptyContent}>
              <IconButton icon="receipt" size={48} iconColor="#999" />
              <Text style={styles.emptyText}>No expenses yet</Text>
              <Text style={styles.emptySubtext}>
                Start tracking your expenses with your groups
              </Text>
            </Card.Content>
          </Card>
        ) : (
          recentExpenses.map((expense) => (
            <Card 
              key={expense.id} 
              style={styles.expenseCard}
              onPress={() => {/* Navigate to expense details */}}
            >
              <Card.Content style={styles.expenseContent}>
                <View style={styles.expenseLeft}>
                  <Text style={styles.expenseCategory}>{expense.category?.icon}</Text>
                  <View style={styles.expenseInfo}>
                    <Text style={styles.expenseDescription}>
                      {expense.description}
                    </Text>
                    <Text style={styles.expenseDate}>
                      {format(new Date(expense.date), 'MMM dd, yyyy')}
                    </Text>
                  </View>
                </View>
                <View style={styles.expenseRight}>
                  <Text style={styles.expenseAmount}>₹{expense.amount}</Text>
                  <Text style={styles.expensePaidBy}>
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

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <Button
          mode="contained"
          icon="plus"
          onPress={() => {/* Navigate to add expense */}}
          style={styles.actionButton}
        >
          Add Expense
        </Button>
        <Button
          mode="outlined"
          icon="cash-multiple"
          onPress={() => {/* Navigate to settle up */}}
          style={styles.actionButton}
        >
          Settle Up
        </Button>
      </View>
    </ScrollView>
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
  header: {
    marginBottom: 16,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: {
    fontSize: 16,
    color: '#666',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  avatar: {
    backgroundColor: '#6200EE',
  },
  balanceCard: {
    marginBottom: 16,
    backgroundColor: '#6200EE',
  },
  balanceLabel: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.8,
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    marginVertical: 8,
  },
  positiveBalance: {
    color: '#4CAF50',
  },
  negativeBalance: {
    color: '#F44336',
  },
  neutralBalance: {
    color: '#fff',
  },
  balanceDescription: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.8,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 8,
  },
  statCard: {
    flex: 1,
  },
  statContent: {
    alignItems: 'center',
    padding: 8,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
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
    color: '#333',
  },
  emptyCard: {
    backgroundColor: '#fff',
  },
  emptyContent: {
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyButton: {
    marginTop: 8,
  },
  groupCard: {
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  groupContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  groupInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  groupText: {
    marginLeft: 12,
  },
  groupName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  groupMembers: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  expenseCard: {
    marginBottom: 8,
    backgroundColor: '#fff',
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
  expenseCategory: {
    fontSize: 32,
    marginRight: 12,
  },
  expenseInfo: {
    flex: 1,
  },
  expenseDescription: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  expenseDate: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  expenseRight: {
    alignItems: 'flex-end',
  },
  expenseAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  expensePaidBy: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
  },
});