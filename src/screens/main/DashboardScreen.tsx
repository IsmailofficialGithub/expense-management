// src/screens/main/DashboardScreen.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
} from "react-native";
import {
  Text,
  Card,
  Avatar,
  Button,
  IconButton,
  Divider,
} from "react-native-paper";
import { useAuth } from "../../hooks/useAuth";
import { useGroups } from "../../hooks/useGroups";
import { useExpenses } from "../../hooks/useExpenses";
import { usePersonalFinance } from "../../hooks/usePersonalFinance";
import { useAppDispatch } from "../../store";
import { fetchGroups } from "../../store/slices/groupsSlice";
import { fetchExpenses } from "../../store/slices/expensesSlice";
import { fetchPersonalTransactions, fetchCompleteBalance } from "../../store/slices/personalFinanceSlice";
import { format } from "date-fns";
import { ErrorHandler } from "../../utils/errorHandler";
import { useToast } from "../../hooks/useToast";
import { useNetworkCheck } from "../../hooks/useNetworkCheck";
import LoadingOverlay from "../../components/LoadingOverlay";
import { useTheme } from "react-native-paper";

export default function DashboardScreen({ navigation }: any) {
  const theme = useTheme();
  const { profile } = useAuth();
  
  const { groups } = useGroups();
  const { expenses } = useExpenses();
  const { transactions, completeBalance } = usePersonalFinance();
  const [isLoading, setIsLoading] = useState(false);
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const { isOnline } = useNetworkCheck({
    showToast: true,
    onOnline: () => {
      loadData();
    },
  });

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();

  }, []);

  const loadData = async () => {
    if (!isOnline) {
      showToast("Unable to load data. No internet connection.", "error");
      return;
    }

    setIsLoading(true);
    try {
      await Promise.all([
        dispatch(fetchGroups()).unwrap(),
        dispatch(fetchExpenses()).unwrap(),
        dispatch(fetchPersonalTransactions()).unwrap(),
        dispatch(fetchCompleteBalance()).unwrap(),
      ]);
    } catch (error) {
      ErrorHandler.handleError(error, showToast, "Dashboard");
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadData();
    } catch (error) {
      ErrorHandler.handleError(error, showToast, "Dashboard Refresh");
    } finally {
      setRefreshing(false);
    }
  };

  // Calculate personal finance
  const personalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const personalExpenses = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  // Calculate group expenses balance
  const myExpenses = expenses.filter((exp) => exp.paid_by === profile?.id);
  const totalPaidByMe = myExpenses.reduce(
    (sum, exp) => sum + Number(exp.amount),
    0,
  );

  const totalIOwe = expenses.reduce((sum, exp) => {
    if (exp.paid_by !== profile?.id) {
      const mySplit = exp.splits?.find((s) => s.user_id === profile?.id);
      if (mySplit && !mySplit.is_settled) {
        return sum + Number(mySplit.amount);
      }
    }
    return sum;
  }, 0);

  const totalOwedToMe = myExpenses.reduce((sum, exp) => {
    const othersOweMeForThisExpense =
      exp.splits
        ?.filter((s) => s.user_id !== profile?.id && !s.is_settled)
        .reduce((splitSum, split) => splitSum + Number(split.amount), 0) || 0;
    return sum + othersOweMeForThisExpense;
  }, 0);

  const groupNetBalance = totalOwedToMe - totalIOwe;

  // Overall balance (Income - Personal Expenses - Group Debts + Group Credits)
  const overallBalance = personalIncome - personalExpenses - totalIOwe + totalOwedToMe;

  // Get recent expenses (last 5)
  const recentExpenses = expenses.slice(0, 5);

  // Get recent personal transactions (last 5)
  const recentPersonalTransactions = transactions.slice(0, 5);

  const showBalanceInfo = () => {
    Alert.alert(
      'Balance Breakdown',
      `Personal Finance:\n` +
      `• Income: ₹${personalIncome.toFixed(2)}\n` +
      `• Expenses: ₹${personalExpenses.toFixed(2)}\n` +
      `• Personal Balance: ₹${(personalIncome - personalExpenses).toFixed(2)}\n\n` +
      `Group Expenses:\n` +
      `• You Paid: ₹${totalPaidByMe.toFixed(2)}\n` +
      `• You Owe: ₹${totalIOwe.toFixed(2)}\n` +
      `• Owed to You: ₹${totalOwedToMe.toFixed(2)}\n` +
      `• Group Balance: ₹${groupNetBalance.toFixed(2)}\n\n` +
      `Overall Balance: ₹${overallBalance.toFixed(2)}`,
      [{ text: 'OK' }]
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Welcome Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View>
            <Text style={[styles.greeting, { color: theme.colors.onSurfaceVariant }]}>Hello,</Text>
            <Text style={[styles.userName, { color: theme.colors.onSurface }]}>
              {profile?.full_name || "User"} 👋
            </Text>
          </View>
      {profile?.avatar_url ? (
  <Avatar.Image
    size={48}
    source={{ uri: profile.avatar_url }}
    style={styles.avatar}
  />
) : (
  <Avatar.Text
    size={48}
    label={profile?.full_name?.substring(0, 2).toUpperCase() || "U"}
    style={styles.avatar}
  />
)}
        </View>
      </View>

      {/* Overall Balance Card */}
      <Card style={styles.overallBalanceCard}>
        <Card.Content>
          <View style={styles.balanceHeader}>
            <Text style={styles.balanceLabel}>Overall Balance</Text>
            <IconButton
              icon="information"
              size={20}
              iconColor="#fff"
              onPress={showBalanceInfo}
            />
          </View>
          <Text
            style={[
              styles.balanceAmount,
              overallBalance > 0
                ? styles.positiveBalance
                : overallBalance < 0
                ? styles.negativeBalance
                : styles.neutralBalance,
            ]}
          >
            ₹{overallBalance.toFixed(2)}
          </Text>
          <Text style={styles.balanceDescription}>
            {overallBalance > 0
              ? "You're in good shape! 💪"
              : overallBalance < 0
              ? "You're spending more than earning"
              : "You're breaking even"}
          </Text>
        </Card.Content>
      </Card>

      {/* Personal Finance Summary */}
      <Card style={styles.summaryCard}>
        <Card.Content>
          <View style={styles.summaryHeader}>
            <Text style={[styles.summaryTitle, { color: theme.colors.onSurface }]}>Personal Finance</Text>
            <Button
              mode="text"
              onPress={() => navigation.navigate("PersonalFinance")}
              compact
            >
              Manage
            </Button>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <IconButton icon="arrow-down-circle" size={24} iconColor="#4CAF50" />
              <Text style={[styles.summaryLabel, { color: theme.colors.onSurfaceVariant }]}>Income</Text>
              <Text style={[styles.summaryValue, styles.incomeText]}>
                ₹{personalIncome.toFixed(0)}
              </Text>
            </View>

            <Divider style={styles.verticalDivider} />

            <View style={styles.summaryItem}>
              <IconButton icon="arrow-up-circle" size={24} iconColor="#F44336" />
              <Text style={[styles.summaryLabel, { color: theme.colors.onSurfaceVariant }]}>Expenses</Text>
              <Text style={[styles.summaryValue, styles.expenseText]}>
                ₹{personalExpenses.toFixed(0)}
              </Text>
            </View>

            <Divider style={styles.verticalDivider} />

            <View style={styles.summaryItem}>
              <IconButton icon="wallet" size={24} iconColor="#2196F3" />
              <Text style={[styles.summaryLabel, { color: theme.colors.onSurfaceVariant }]}>Savings</Text>
              <Text style={[styles.summaryValue, styles.savingsText]}>
                ₹{(personalIncome - personalExpenses).toFixed(0)}
              </Text>
            </View>
          </View>
        </Card.Content>
      </Card>

      {/* Group Expenses Summary */}
      <Card style={styles.summaryCard}>
        <Card.Content>
          <View style={styles.summaryHeader}>
            <Text style={[styles.summaryTitle, { color: theme.colors.onSurface }]}>Group Expenses</Text>
            <Button
              mode="text"
              onPress={() => navigation.navigate("Expenses")}
              compact
            >
              View All
            </Button>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <IconButton icon="cash" size={24} iconColor="#4CAF50" />
              <Text style={[styles.summaryLabel, { color: theme.colors.onSurfaceVariant }]}>You Paid</Text>
              <Text style={[styles.summaryValue, { color: theme.colors.onSurface }]}>₹{totalPaidByMe.toFixed(0)}</Text>
            </View>

            <Divider style={styles.verticalDivider} />

            <View style={styles.summaryItem}>
              <IconButton icon="arrow-up" size={24} iconColor="#F44336" />
              <Text style={[styles.summaryLabel, { color: theme.colors.onSurfaceVariant }]}>You Owe</Text>
              <Text style={[styles.summaryValue, { color: theme.colors.onSurface }]}>₹{totalIOwe.toFixed(0)}</Text>
            </View>

            <Divider style={styles.verticalDivider} />

            <View style={styles.summaryItem}>
              <IconButton icon="arrow-down" size={24} iconColor="#2196F3" />
              <Text style={[styles.summaryLabel, { color: theme.colors.onSurfaceVariant }]}>Owed to You</Text>
              <Text style={[styles.summaryValue, { color: theme.colors.onSurface }]}>₹{totalOwedToMe.toFixed(0)}</Text>
            </View>
          </View>

          <Divider style={styles.divider} />

          <View style={styles.groupBalanceRow}>
            <Text style={styles.groupBalanceLabel}>Group Net Balance</Text>
            <Text
              style={[
                styles.groupBalanceValue,
                groupNetBalance > 0
                  ? styles.positiveBalance
                  : groupNetBalance < 0
                  ? styles.negativeBalance
                  : styles.neutralBalance,
              ]}
            >
              {groupNetBalance > 0 ? '+' : ''}₹{groupNetBalance.toFixed(2)}
            </Text>
          </View>
        </Card.Content>
      </Card>

      {/* My Groups Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>My Groups</Text>
          <Button
            mode="text"
            onPress={() => navigation.navigate("Groups")}
            compact
          >
            View All
          </Button>
        </View>

        {groups.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Card.Content style={styles.emptyContent}>
              <IconButton icon="account-group" size={48} iconColor="#999" />
              <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>No groups yet</Text>
              <Button
                mode="contained"
                onPress={() => navigation.navigate("Groups")}
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
              onPress={() => {
                navigation.navigate("GroupDetails", { groupId: group.id });
              }}
            >
              <Card.Content style={styles.groupContent}>
                <View style={styles.groupInfo}>
                  <Avatar.Text
                    size={40}
                    label={group.name.substring(0, 2).toUpperCase()}
                  />
                  <View style={styles.groupText}>
                    <Text style={[styles.groupName, { color: theme.colors.onSurface }]}>{group.name}</Text>
                    <Text style={[styles.groupMembers, { color: theme.colors.onSurfaceVariant }]}>
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

      {/* Recent Personal Transactions */}
      {recentPersonalTransactions.length > 0 && (
        <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Recent Personal Transactions</Text>
            <Button
              mode="text"
              onPress={() => navigation.navigate("PersonalFinance")}
              compact
            >
              View All
            </Button>
          </View>

          {recentPersonalTransactions.map((transaction) => (
            <Card
              key={transaction.id}
              style={styles.transactionCard}
              onPress={() => {
                // TODO: Navigate to transaction details
                console.log('View transaction:', transaction.id);
              }}
            >
              <Card.Content style={styles.transactionContent}>
                <View style={styles.transactionLeft}>
                  <IconButton
                    icon={transaction.type === 'income' ? 'arrow-down-circle' : 'arrow-up-circle'}
                    size={32}
                    iconColor={transaction.type === 'income' ? '#4CAF50' : '#F44336'}
                  />
                  <View style={styles.transactionInfo}>
                    <Text style={[styles.transactionDescription, { color: theme.colors.onSurface }]}>
                      {transaction.description}
                    </Text>
                    <Text style={[styles.transactionDate, { color: theme.colors.onSurfaceVariant }]}>
                      {format(new Date(transaction.date), "MMM dd, yyyy")} • {transaction.category}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[
                    styles.transactionAmount,
                    transaction.type === 'income' ? styles.incomeText : styles.expenseText,
                  ]}
                >
                  {transaction.type === 'income' ? '+' : '-'}₹{transaction.amount}
                </Text>
              </Card.Content>
            </Card>
          ))}
        </View>
      )}

      {/* Recent Group Expenses */}
      {recentExpenses.length > 0 && (
        <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Recent Group Expenses</Text>
            <Button
              mode="text"
              onPress={() => navigation.navigate("Expenses")}
              compact
            >
              View All
            </Button>
          </View>

          {recentExpenses.map((expense) => (
            <Card
              key={expense.id}
              style={styles.expenseCard}
              onPress={() => {
                navigation.navigate("ExpenseDetails", {
                  expenseId: expense.id,
                });
              }}
            >
              <Card.Content style={styles.expenseContent}>
                <View style={styles.expenseLeft}>
                  <Text style={styles.expenseCategory}>
                    {expense.category?.icon}
                  </Text>
                  <View style={styles.expenseInfo}>
                    <Text style={[styles.expenseDescription, { color: theme.colors.onSurface }]}>
                      {expense.description}
                    </Text>
                    <Text style={[styles.expenseDate, { color: theme.colors.onSurfaceVariant }]}>
                      {format(new Date(expense.date), "MMM dd, yyyy")}
                    </Text>
                  </View>
                </View>
                  <View style={styles.expenseRight}>
                    <Text style={[styles.expenseAmount, { color: theme.colors.onSurface }]}>₹{expense.amount}</Text>
                    <Text style={[styles.expensePaidBy, { color: theme.colors.onSurfaceVariant }]}>
                      {expense.paid_by === profile?.id
                        ? "You paid"
                        : `${expense.paid_by_user?.full_name || "Someone"} paid`}
                    </Text>
                  </View>
              </Card.Content>
            </Card>
          ))}
        </View>
      )}

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <Button
          mode="contained"
          icon="plus"
          onPress={() => {
            navigation.navigate("AddPersonalTransaction");
          }}
          style={styles.actionButton}
        >
          Add Income/Expense
        </Button>
        <Button
          mode="contained"
          icon="account-group"
          onPress={() => {
            navigation.navigate("AddExpense");
          }}
          style={styles.actionButton}
        >
          Add Group Expense
        </Button>
      </View>

      {/* Settings & Tools */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Settings & Tools</Text>
        <View style={styles.toolsGrid}>
          <Card
            style={[styles.toolCard, styles.toolCardFirst]}
            onPress={() => navigation.navigate("PaymentMethods")}
          >
            <Card.Content style={styles.toolContent}>
              <IconButton icon="credit-card" size={32} iconColor="#6200EE" />
              <Text style={[styles.toolLabel, { color: theme.colors.onSurface }]}>Payment Methods</Text>
            </Card.Content>
          </Card>
          <Card
            style={[styles.toolCard, styles.toolCardLast]}
            onPress={() => navigation.navigate("ManageHotel")}
          >
            <Card.Content style={styles.toolContent}>
              <IconButton icon="store" size={32} iconColor="#4CAF50" />
              <Text style={[styles.toolLabel, { color: theme.colors.onSurface }]}>Manage Hotels</Text>
            </Card.Content>
          </Card>
        </View>
      </View>

      <LoadingOverlay
        visible={isLoading && !refreshing}
        message="Loading your data..."
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 16,
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  greeting: {
    fontSize: 16,
  },
  userName: {
    fontSize: 24,
    fontWeight: "bold",
  },
  avatar: {
    backgroundColor: "#6200EE",
  },
  overallBalanceCard: {
    marginBottom: 16,
    backgroundColor: "#6200EE",
    elevation: 4,
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 14,
    color: "#fff",
    opacity: 0.8,
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: "bold",
    marginVertical: 8,
  },
  positiveBalance: {
    color: "#4CAF50",
  },
  negativeBalance: {
    color: "#F44336",
  },
  neutralBalance: {
    color: "#fff",
  },
  balanceDescription: {
    fontSize: 12,
    color: "#fff",
    opacity: 0.8,
  },
  summaryCard: {
    marginBottom: 16,
    elevation: 2,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    marginTop: 4,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 4,
  },
  incomeText: {
    color: '#4CAF50',
  },
  expenseText: {
    color: '#F44336',
  },
  savingsText: {
    color: '#2196F3',
  },
  verticalDivider: {
    width: 1,
    height: 40,
  },
  divider: {
    marginVertical: 12,
  },
  groupBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  groupBalanceLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  groupBalanceValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },
  emptyCard: {
  },
  emptyContent: {
    alignItems: "center",
    padding: 24,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  emptyButton: {
    marginTop: 8,
  },
  groupCard: {
    marginBottom: 8,
  },
  groupContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  groupInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  groupText: {
    marginLeft: 12,
  },
  groupName: {
    fontSize: 16,
    fontWeight: "600",
  },
  groupMembers: {
    fontSize: 12,
    marginTop: 2,
  },
  transactionCard: {
    marginBottom: 8,
  },
  transactionContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  transactionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionDescription: {
    fontSize: 16,
    fontWeight: "500",
  },
  transactionDate: {
    fontSize: 12,
    marginTop: 2,
  },
  transactionAmount: {
    fontSize: 18,
    fontWeight: "bold",
  },
  expenseCard: {
    marginBottom: 8,
  },
  expenseContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,  // Reduced from default padding
  },
  expenseLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  expenseCategory: {
    fontSize: 28,  // Reduced from 32
    marginRight: 10,  // Reduced from 12
  },
  expenseInfo: {
    flex: 1,
  },
  expenseDescription: {
    fontSize: 15,  // Slightly reduced from 16
    fontWeight: "500",
  },
  expenseDate: {
    fontSize: 11,  // Reduced from 12
    marginTop: 2,
  },
  expenseRight: {
    alignItems: "flex-end",
  },
  expenseAmount: {
    fontSize: 15,  // Reduced from 16
    fontWeight: "bold",
  },
  expensePaidBy: {
    fontSize: 11,  // Reduced from 12
    marginTop: 2,
  },
  quickActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    marginBottom: 24,  // Added margin bottom
  },
  actionButton: {
    flex: 1,
  },
  toolsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  toolCard: {
    flex: 1,
    elevation: 2,
  },
  toolCardFirst: {
    marginRight: 6,
  },
  toolCardLast: {
    marginLeft: 6,
  },
  toolContent: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  toolLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
});