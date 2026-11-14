// src/screens/main/DashboardScreen.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  Platform,
  TouchableOpacity,
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
import { expenseService, invitationService } from "../../services/supabase.service";
import type { MyExpenseSummary } from "../../types/database.types";
import { LinearGradient } from "expo-linear-gradient";
import CategoryIcon from '../../components/CategoryIcon';

const INCOME = '#43A047';
const EXPENSE = '#E53935';
const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
// Soft background for an icon: the color at ~15% opacity (6-digit hex only), else the fallback.
const tint = (color: string, fallback: string) => (/^#[0-9a-f]{6}$/i.test(color) ? `${color}26` : fallback);

export default function DashboardScreen({ navigation }: any) {
  const theme = useTheme();
  const { profile } = useAuth();

  const { groups } = useGroups();
  const { expenses } = useExpenses();
  const { transactions, completeBalance } = usePersonalFinance();
  const [isLoading, setIsLoading] = useState(false);
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const [isBalanceHidden, setIsBalanceHidden] = useState(true);

  const toggleBalanceVisibility = () => {
    setIsBalanceHidden(!isBalanceHidden);
  };
  const { isOnline } = useNetworkCheck({
    showToast: true,
    onOnline: () => {
      loadData();
    },
  });

  const [refreshing, setRefreshing] = useState(false);
  const [pendingInvitationsCount, setPendingInvitationsCount] = useState(0);
  // Server-computed totals over all my groups; null offline (falls back to the cached expenses below)
  const [summary, setSummary] = useState<MyExpenseSummary | null>(null);

  useEffect(() => {
    loadData();
    loadPendingInvitations();
  }, []);

  const loadPendingInvitations = async () => {
    if (!isOnline || !profile) return;

    try {
      const invitations = await invitationService.getPendingInvitations();
      setPendingInvitationsCount(invitations.length);
    } catch (error) {
      // Silently fail - notifications are not critical
      console.error("Failed to load invitations:", error);
    }
  };

  const loadData = async () => {
    // Only show loading spinner if we have absolutely no data
    if (groups.length === 0 && expenses.length === 0 && transactions.length === 0) {
      setIsLoading(true);
    }

    try {
      // Data is already loaded from cache in Provider.tsx
      // If online, sync in background to get latest data
      if (isOnline) {
        // Fire and forget - don't await to keep UI responsive
        Promise.all([
          dispatch(fetchCompleteBalance()),
          dispatch(fetchGroups()),
          dispatch(fetchExpenses({ limit: 20 })),
          dispatch(fetchPersonalTransactions()),
          expenseService.getMySummary().then(setSummary),
        ]).catch(err => console.warn('Background sync failed:', err));
      } else {
        // Offline: data is already in Redux from cache
        // Just ensure we have the data (fetch will use cache)
        if (groups.length === 0) {
          dispatch(fetchGroups());
        }
        if (expenses.length === 0) {
          dispatch(fetchExpenses({ limit: 20 }));
        }
        if (transactions.length === 0) {
          dispatch(fetchPersonalTransactions());
        }
      }
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
      await loadPendingInvitations();
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
  const localPaidByMe = myExpenses.reduce(
    (sum, exp) => sum + Number(exp.amount),
    0,
  );

  const localIOwe = expenses.reduce((sum, exp) => {
    if (exp.paid_by !== profile?.id) {
      const mySplit = exp.splits?.find((s) => s.user_id === profile?.id);
      if (mySplit && !mySplit.is_settled) {
        return sum + Number(mySplit.amount);
      }
    }
    return sum;
  }, 0);

  const localOwedToMe = myExpenses.reduce((sum, exp) => {
    const othersOweMeForThisExpense =
      exp.splits
        ?.filter((s) => s.user_id !== profile?.id && !s.is_settled)
        .reduce((splitSum, split) => splitSum + Number(split.amount), 0) || 0;
    return sum + othersOweMeForThisExpense;
  }, 0);

  // Server totals cover every expense; local ones only the cached page (offline fallback)
  const totalPaidByMe = summary?.total_paid_by_me ?? localPaidByMe;
  const totalIOwe = summary?.total_i_owe ?? localIOwe;
  const totalOwedToMe = summary?.total_owed_to_me ?? localOwedToMe;
  const groupNetBalance = totalOwedToMe - totalIOwe;

  // Overall balance (Income - Personal Expenses - Group Debts + Group Credits)
  const overallBalance = personalIncome - personalExpenses + groupNetBalance;

  // Get recent expenses (last 5) - sorted by date, newest first
  const recentExpenses = [...expenses]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  // Get recent personal transactions (last 5)
  const recentPersonalTransactions = transactions.slice(0, 5);

  // Calculate expenses by category for Expense Cards section
  const expensesByCategory = expenses.reduce((acc: any, exp: any) => {
    const categoryName = exp.category?.name || 'Other';
    if (!acc[categoryName]) {
      acc[categoryName] = {
        name: categoryName,
        icon: exp.category?.icon || 'cash',
        amount: 0,
        color: exp.category?.color || theme.colors.primary,
      };
    }
    acc[categoryName].amount += Number(exp.amount);
    return acc;
  }, {});

  // Get top 4 expense categories
  const topExpenseCategories = (summary
    ? summary.by_category.map((c) => ({ name: c.name, icon: c.icon || 'cash', amount: c.amount, color: c.color || theme.colors.primary }))
    : Object.values(expensesByCategory))
    .sort((a: any, b: any) => b.amount - a.amount)
    .slice(0, 4) as any[];
  const categoryTotal = topExpenseCategories.reduce((sum: number, c: any) => sum + Number(c.amount), 0);

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
              {profile?.full_name || "User"}
            </Text>
          </View>
          <View style={styles.headerRight}>
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
      </View>

      {/* Overall Balance Card */}
      {/* --- MASTERCARD STYLE CARD WITH HIDE/SHOW --- */}
      <View style={styles.cardContainer}>
        <LinearGradient
          colors={['#5b247a', '#1bcedf']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.creditCard}
        >
          {/* Top Row: Chip and Contactless */}
          <View style={styles.cardTopRow}>
            <View style={styles.cardChip} />
            <IconButton
              icon="wifi"
              size={24}
              iconColor="rgba(10, 132, 53, 0.6)"
              style={{ transform: [{ rotate: '90deg' }], margin: 0 }}
            />
          </View>

          {/* Middle: Label, Eye, and Balance */}
          <View style={styles.cardMiddle}>
            <View style={styles.balanceHeader}>
              <View style={styles.labelRow}>
                <Text style={styles.cardLabel}>Total Balance</Text>
                <IconButton
                  icon={isBalanceHidden ? "eye-off" : "eye"}
                  size={20}
                  iconColor="rgba(255,255,255,0.8)"
                  onPress={toggleBalanceVisibility}
                  style={styles.eyeIcon}
                  rippleColor="rgba(255,255,255,0.3)"
                />
              </View>

              <IconButton
                icon="information-outline"
                size={18}
                iconColor="rgba(255,255,255,0.5)"
                onPress={showBalanceInfo}
                style={styles.infoIcon}
              />
            </View>

            {/* THE BALANCE / MASKED TEXT */}
            <Text style={styles.cardNumber}>
              {isBalanceHidden
                ? "₹ ******"
                : `₹ ${overallBalance.toFixed(2)}`}
            </Text>
          </View>

          {/* Bottom Row: Details and Logo */}
          <View style={styles.cardBottom}>
            <View style={styles.cardHolderInfo}>
              <Text style={styles.cardLabelSmall}>CARD HOLDER</Text>
              <Text style={styles.cardName} numberOfLines={1}>
                {profile?.full_name?.toUpperCase() || "USER"}
              </Text>
              <Text style={styles.cardStatusText}>
                {isBalanceHidden
                  ? "Status: Hidden"
                  : overallBalance >= 0 ? "Status: Active" : "Status: Attention"}
              </Text>
            </View>

            <View style={styles.mcLogoContainer}>
              <View style={[styles.mcCircle, { backgroundColor: 'rgba(235, 0, 27, 0.8)' }]} />
              <View style={[styles.mcCircle, { backgroundColor: 'rgba(247, 158, 27, 0.8)', marginLeft: -12 }]} />
            </View>
          </View>
        </LinearGradient>
      </View>

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

      {/* Spending by category: one card, each row shows the category's share of the total */}
      {topExpenseCategories.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Top Categories</Text>
            <Button mode="text" compact onPress={() => navigation.navigate("Expenses")}>View All</Button>
          </View>
          <Card mode="contained" style={[styles.listCard, { backgroundColor: theme.colors.elevation.level1 }]}>
            {topExpenseCategories.map((category, index) => {
              const color = category.color || theme.colors.primary;
              const share = categoryTotal > 0 ? category.amount / categoryTotal : 0;
              return (
                <React.Fragment key={category.name}>
                  {index > 0 && <Divider style={{ backgroundColor: theme.colors.outlineVariant }} />}
                  <TouchableOpacity activeOpacity={0.7} style={styles.listRow}
                    onPress={() => navigation.navigate("Expenses", { categoryFilter: category.name })}>
                    <View style={[styles.iconBubble, { backgroundColor: tint(color, theme.colors.primaryContainer) }]}>
                      <CategoryIcon icon={category.icon} color={color} size={20} />
                    </View>
                    <View style={styles.listRowBody}>
                      <View style={styles.listRowTop}>
                        <Text style={[styles.listRowTitle, { color: theme.colors.onSurface }]} numberOfLines={1}>{category.name}</Text>
                        <Text style={[styles.listRowAmount, { color: theme.colors.onSurface }]}>₹{money(category.amount)}</Text>
                      </View>
                      <View style={styles.listRowTop}>
                        <View style={[styles.shareTrack, { backgroundColor: theme.colors.surfaceVariant }]}>
                          <View style={[styles.shareFill, { width: `${Math.max(share * 100, 2)}%`, backgroundColor: color }]} />
                        </View>
                        <Text style={[styles.shareLabel, { color: theme.colors.onSurfaceVariant }]}>{Math.round(share * 100)}%</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                </React.Fragment>
              );
            })}
          </Card>
        </View>
      )}

      {/* Groups: horizontal row of tiles */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Groups</Text>
          <Button mode="text" onPress={() => navigation.navigate("Groups")} compact>View All</Button>
        </View>

        {groups.length === 0 ? (
          <Card mode="contained" style={[styles.listCard, { backgroundColor: theme.colors.elevation.level1 }]}>
            <Card.Content style={styles.emptyContent}>
              <IconButton icon="account-group" size={40} iconColor={theme.colors.onSurfaceVariant} />
              <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>No groups yet</Text>
              <Button mode="contained" onPress={() => navigation.navigate("Groups")} style={styles.emptyButton}>
                Create Your First Group
              </Button>
            </Card.Content>
          </Card>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupTiles}>
            {groups.slice(0, 8).map((group) => {
              const avatarUrl = group.members?.[0]?.user?.avatar_url;
              const memberCount = group.members?.length || 0;
              return (
                <TouchableOpacity key={group.id} activeOpacity={0.7}
                  style={[styles.groupTile, { backgroundColor: theme.colors.elevation.level1 }]}
                  onPress={() => navigation.navigate("GroupDetails", { groupId: group.id })}>
                  {avatarUrl ? (
                    <Avatar.Image size={48} source={{ uri: avatarUrl }} />
                  ) : (
                    <Avatar.Text size={48} label={group.name.substring(0, 2).toUpperCase()}
                      style={{ backgroundColor: theme.colors.primaryContainer }}
                      labelStyle={{ color: theme.colors.onPrimaryContainer, fontSize: 18, fontWeight: '700' }} />
                  )}
                  <Text style={[styles.groupTileName, { color: theme.colors.onSurface }]} numberOfLines={1}>{group.name}</Text>
                  <Text style={[styles.groupTileMeta, { color: theme.colors.onSurfaceVariant }]}>
                    {memberCount} {memberCount === 1 ? 'member' : 'members'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* Recent Personal Transactions: one card, rows split by dividers */}
      {recentPersonalTransactions.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Recent Transactions</Text>
            <Button mode="text" onPress={() => navigation.navigate("PersonalFinance")} compact>View All</Button>
          </View>
          <Card mode="contained" style={[styles.listCard, { backgroundColor: theme.colors.elevation.level1 }]}>
            {recentPersonalTransactions.map((transaction, index) => {
              const income = transaction.type === 'income';
              const color = income ? INCOME : EXPENSE;
              return (
                <React.Fragment key={transaction.id}>
                  {index > 0 && <Divider style={{ backgroundColor: theme.colors.outlineVariant }} />}
                  <TouchableOpacity activeOpacity={0.7} style={styles.listRow}
                    onPress={() => navigation.navigate("PersonalTransactionDetails", { transactionId: transaction.id })}>
                    <View style={[styles.iconBubble, { backgroundColor: tint(color, theme.colors.surfaceVariant) }]}>
                      <IconButton icon={income ? 'arrow-bottom-left' : 'arrow-top-right'} size={20} iconColor={color} style={{ margin: 0 }} />
                    </View>
                    <View style={styles.listRowBody}>
                      <View style={styles.listRowTop}>
                        <Text style={[styles.listRowTitle, { color: theme.colors.onSurface }]} numberOfLines={1}>{transaction.description}</Text>
                        <Text style={[styles.listRowAmount, { color }]}>{income ? '+' : '−'}₹{money(Number(transaction.amount))}</Text>
                      </View>
                      <Text style={[styles.listRowSub, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
                        {format(new Date(transaction.date), "MMM dd")} · {transaction.category}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </React.Fragment>
              );
            })}
          </Card>
        </View>
      )}

      {/* Recent Group Expenses: same list style */}
      {groups.length > 0 && recentExpenses.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Recent Group Expenses</Text>
            <Button mode="text" onPress={() => navigation.navigate("Expenses")} compact>View All</Button>
          </View>
          <Card mode="contained" style={[styles.listCard, { backgroundColor: theme.colors.elevation.level1 }]}>
            {recentExpenses.map((expense, index) => {
              const color = expense.category?.color || theme.colors.primary;
              const payer = expense.paid_by === profile?.id ? 'You paid' : `${expense.paid_by_user?.full_name || 'Someone'} paid`;
              return (
                <React.Fragment key={expense.id}>
                  {index > 0 && <Divider style={{ backgroundColor: theme.colors.outlineVariant }} />}
                  <TouchableOpacity activeOpacity={0.7} style={styles.listRow}
                    onPress={() => navigation.navigate("ExpenseDetails", { expenseId: expense.id })}>
                    <View style={[styles.iconBubble, { backgroundColor: tint(color, theme.colors.primaryContainer) }]}>
                      <CategoryIcon icon={expense.category?.icon} color={color} size={20} />
                    </View>
                    <View style={styles.listRowBody}>
                      <View style={styles.listRowTop}>
                        <Text style={[styles.listRowTitle, { color: theme.colors.onSurface }]} numberOfLines={1}>{expense.description}</Text>
                        <Text style={[styles.listRowAmount, { color: theme.colors.onSurface }]}>₹{money(Number(expense.amount))}</Text>
                      </View>
                      <Text style={[styles.listRowSub, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
                        {format(new Date(expense.date), "MMM dd")} · {payer}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </React.Fragment>
              );
            })}
          </Card>
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
        visible={isLoading && !refreshing && groups.length === 0 && expenses.length === 0}
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
  headerRight: {
    flexDirection: "row",
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

  cardContainer: {
    marginBottom: 24,
    borderRadius: 20,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
  creditCard: {
    borderRadius: 20,
    padding: 24,
    height: 220,
    justifyContent: "space-between",
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardChip: {
    width: 50,
    height: 35,
    backgroundColor: "#e0e0e0",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    position: 'relative',
    overflow: 'hidden',
  },
  cardMiddle: {
    justifyContent: "center",
  },
  // UPDATED HEADER STYLES
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    letterSpacing: 1.5,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  eyeIcon: {
    margin: 0,
    marginLeft: 10,
    height: 24,
    width: 24,
  },
  infoIcon: {
    margin: 0,
    padding: 0,
    height: 20,
    width: 20,
  },
  // UPDATED NUMBER STYLE
  cardNumber: {
    color: "#fff",
    fontSize: 28, // Slightly smaller to fit **** safely
    fontWeight: "bold",
    letterSpacing: 2, // Wider spacing looks more like a credit card
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  // ... Keep Bottom Row styles ...
  cardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  cardHolderInfo: {
    flex: 1,
  },
  cardLabelSmall: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 10,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  cardName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    letterSpacing: 1,
    marginTop: 2,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  cardStatusText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    marginTop: 2,
  },
  mcLogoContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 5,
  },
  mcCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    marginBottom: 18,
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
  listCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listRowBody: {
    flex: 1,
    gap: 4,
  },
  listRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  listRowTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  listRowAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  listRowSub: {
    fontSize: 12,
  },
  shareTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  shareFill: {
    height: 6,
    borderRadius: 3,
  },
  shareLabel: {
    fontSize: 12,
    width: 36,
    textAlign: 'right',
  },
  groupTiles: {
    gap: 12,
    paddingRight: 4,
  },
  groupTile: {
    width: 120,
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: 16,
    gap: 4,
  },
  groupTileName: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '600',
    maxWidth: '100%',
  },
  groupTileMeta: {
    fontSize: 12,
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