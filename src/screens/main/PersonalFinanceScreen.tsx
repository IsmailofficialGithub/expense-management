// src/screens/main/PersonalFinanceScreen.tsx
import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Text,
  Card,
  IconButton,
  Button,
  Chip,
  FAB,
  SegmentedButtons,
  Divider,
  useTheme,
} from 'react-native-paper';
import { usePersonalFinance } from '../../hooks/usePersonalFinance';
import { useAuth } from '../../hooks/useAuth';
import { useAppDispatch } from '../../store';
import {
  fetchPersonalTransactions,
  fetchPersonalCategories,
  deletePersonalTransaction,
} from '../../store/slices/personalFinanceSlice';
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { ErrorHandler } from '../../utils/errorHandler';
import { useToast } from '../../hooks/useToast';
import { useNetworkCheck } from '../../hooks/useNetworkCheck';
import LoadingOverlay from '../../components/LoadingOverlay';
import SafeScrollView from '../../components/SafeScrollView';
import ErrorState from '../../components/ErrorState';

export default function PersonalFinanceScreen({ navigation }: any) {
  const { transactions, categories, loading } = usePersonalFinance();
  const { profile } = useAuth();
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const { isOnline } = useNetworkCheck({
    showToast: true,
    onOnline: () => loadData(),
  });
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [refreshing, setRefreshing] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBalanceHidden, setIsBalanceHidden] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setError(null);
    try {
      // Data is already loaded from cache in Provider.tsx
      // If online, sync in background to get latest data
      if (isOnline) {
        await Promise.all([
          dispatch(fetchPersonalTransactions()).unwrap(),
          dispatch(fetchPersonalCategories()).unwrap(),
        ]);
      } else {
        // Offline: data is already in Redux from cache
        // Just ensure we have the data (fetch will use cache)
        const state = require('../../store').store.getState();
        if (state.personalFinance.transactions.length === 0) {
          await dispatch(fetchPersonalTransactions()).unwrap();
        }
        if (state.personalFinance.categories.length === 0) {
          await dispatch(fetchPersonalCategories()).unwrap();
        }
      }
    } catch (error: any) {
      const errorMessage = ErrorHandler.getUserFriendlyMessage(error);
      setError(errorMessage);
      ErrorHandler.handleError(error, showToast, 'Personal Finance');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadData();
    } catch (error) {
      // Error already handled in loadData
    } finally {
      setRefreshing(false);
    }
  };

  const handleDeleteTransaction = (transactionId: string, description: string) => {
    Alert.alert(
      'Delete Transaction',
      `Delete "${description}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Delete works offline - it will be queued for sync

            setIsProcessing(true);
            try {
              await dispatch(deletePersonalTransaction(transactionId)).unwrap();
              showToast('Transaction deleted successfully', 'success');
            } catch (error) {
              ErrorHandler.handleError(error, showToast, 'Delete Transaction');
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };

  // Filter transactions by type
  const filteredTransactions = transactions.filter(t => {
    if (filterType === 'all') return true;
    return t.type === filterType;
  });

  // Filter by current month
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const monthTransactions = filteredTransactions.filter(t => {
    const transactionDate = new Date(t.date);
    return transactionDate >= monthStart && transactionDate <= monthEnd;
  });

  // Calculate monthly totals
  const monthlyIncome = monthTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const monthlyExpenses = monthTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const monthlySavings = monthlyIncome - monthlyExpenses;

  // Calculate overall totals
  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const totalExpenses = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const totalSavings = totalIncome - totalExpenses;

  // Group transactions by date
  const groupedTransactions: { [date: string]: any[] } = {};
  monthTransactions.forEach(transaction => {
    const dateKey = format(new Date(transaction.date), 'yyyy-MM-dd');
    if (!groupedTransactions[dateKey]) {
      groupedTransactions[dateKey] = [];
    }
    groupedTransactions[dateKey].push(transaction);
  });

  const sortedDates = Object.keys(groupedTransactions).sort((a, b) =>
    new Date(b).getTime() - new Date(a).getTime()
  );

  const handlePreviousMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1));
  };

  const handleNextMonth = () => {
    const nextMonth = addMonths(currentMonth, 1);
    if (nextMonth <= new Date()) {
      setCurrentMonth(nextMonth);
    }
  };

  const getCategoryIcon = (categoryName: string) => {
    const category = categories.find(c => c.name === categoryName);
    return category?.icon || '💰';
  };

  const toggleBalanceVisibility = () => {
    setIsBalanceHidden(!isBalanceHidden);
  };

  const showBalanceInfo = () => {
    Alert.alert(
      'Balance Breakdown',
      `Personal Finance:\n` +
      `• Total Income: ₹${totalIncome.toFixed(2)}\n` +
      `• Total Expenses: ₹${totalExpenses.toFixed(2)}\n` +
      `• Total Savings: ₹${totalSavings.toFixed(2)}\n\n` +
      `Current Month (${format(currentMonth, 'MMMM yyyy')}):\n` +
      `• Income: ₹${monthlyIncome.toFixed(2)}\n` +
      `• Expenses: ₹${monthlyExpenses.toFixed(2)}\n` +
      `• Savings: ₹${monthlySavings.toFixed(2)}`,
      [{ text: 'OK' }]
    );
  };

  // Show error state if there's an error and no data
  if (error && transactions.length === 0 && !loading) {
    return (
      <View style={styles.container}>
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null);
            loadData();
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Overall Balance Card - Master Card Style */}
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
                  ? "PKR ******"
                  : `PKR ${totalSavings.toFixed(2)}`}
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
                    : totalSavings >= 0 ? "Status: Active" : "Status: Attention"}
                </Text>
              </View>

              <View style={styles.mcLogoContainer}>
                <View style={[styles.mcCircle, { backgroundColor: 'rgba(235, 0, 27, 0.8)' }]} />
                <View style={[styles.mcCircle, { backgroundColor: 'rgba(247, 158, 27, 0.8)', marginLeft: -12 }]} />
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* Month Selector */}
        <Card style={styles.monthCard}>
          <Card.Content>
            <View style={styles.monthSelector}>
              <IconButton
                icon="chevron-left"
                size={24}
                onPress={handlePreviousMonth}
              />
              <Text style={styles.monthText}>
                {format(currentMonth, 'MMMM yyyy')}
              </Text>
              <IconButton
                icon="chevron-right"
                size={24}
                onPress={handleNextMonth}
                disabled={addMonths(currentMonth, 1) > new Date()}
              />
            </View>

            <View style={styles.monthlyStats}>
              <View style={styles.statItem}>
                <IconButton icon="arrow-down-circle" size={24} iconColor="#4CAF50" style={styles.statIcon} />
                <View style={styles.statTextContainer}>
                  <Text style={styles.statLabel} numberOfLines={1}>Income</Text>
                  <Text 
                    style={[styles.statValue, styles.incomeText]} 
                    numberOfLines={1} 
                    adjustsFontSizeToFit
                  >
                    ₹{monthlyIncome.toFixed(0)}
                  </Text>
                </View>
              </View>

              <View style={styles.statItem}>
                <IconButton icon="arrow-up-circle" size={24} iconColor="#F44336" style={styles.statIcon} />
                <View style={styles.statTextContainer}>
                  <Text style={styles.statLabel} numberOfLines={1}>Expenses</Text>
                  <Text 
                    style={[styles.statValue, styles.expenseText]} 
                    numberOfLines={1} 
                    adjustsFontSizeToFit
                  >
                    ₹{monthlyExpenses.toFixed(0)}
                  </Text>
                </View>
              </View>

              <View style={styles.statItem}>
                <IconButton icon="wallet" size={24} iconColor="#2196F3" style={styles.statIcon} />
                <View style={styles.statTextContainer}>
                  <Text style={styles.statLabel} numberOfLines={1}>Savings</Text>
                  <Text
                    style={[
                      styles.statValue,
                      monthlySavings > 0
                        ? styles.incomeText
                        : monthlySavings < 0
                          ? styles.expenseText
                          : styles.neutralText,
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    ₹{monthlySavings.toFixed(0)}
                  </Text>
                </View>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Filter Buttons */}
        <SegmentedButtons
          value={filterType}
          onValueChange={(value) => setFilterType(value as any)}
          buttons={[
            { value: 'all', label: 'All' },
            { value: 'income', label: 'Income' },
            { value: 'expense', label: 'Expense' },
          ]}
          style={styles.filterButtons}
        />

        {/* Transactions List */}
        <View style={styles.transactionsSection}>
          {monthTransactions.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Card.Content style={styles.emptyContent}>
                <IconButton icon="wallet-outline" size={64} iconColor="#999" />
                <Text style={styles.emptyText}>No transactions this month</Text>
                <Text style={styles.emptySubtext}>
                  Add your first {filterType === 'all' ? 'transaction' : filterType}
                </Text>
              </Card.Content>
            </Card>
          ) : (
            sortedDates.map((date) => (
              <View key={date} style={styles.dateGroup}>
                <Text style={styles.dateHeader}>
                  {format(new Date(date), 'EEEE, MMMM dd, yyyy')}
                </Text>

                {groupedTransactions[date].map((transaction) => (
                  <Card
                    key={transaction.id}
                    style={styles.transactionCard}
                    onPress={() => {
                      navigation.navigate('PersonalTransactionDetails', {
                        transactionId: transaction.id,
                      });
                    }}
                  >
                    <Card.Content style={styles.transactionContent}>
                      <View style={styles.transactionLeft}>
                        <Text style={styles.categoryIcon}>
                          {getCategoryIcon(transaction.category)}
                        </Text>
                        <View style={styles.transactionInfo}>
                          <Text style={styles.transactionDescription}>
                            {transaction.description}
                          </Text>
                          <Chip
                            mode="outlined"
                            style={styles.categoryChip}
                            textStyle={styles.categoryChipText}
                          >
                            {transaction.category}
                          </Chip>
                          {transaction.notes && (
                            <Text style={styles.transactionNotes} numberOfLines={1}>
                              {transaction.notes}
                            </Text>
                          )}
                        </View>
                      </View>

                      <View style={styles.transactionRight}>
                        <Text
                          style={[
                            styles.transactionAmount,
                            transaction.type === 'income'
                              ? styles.incomeText
                              : styles.expenseText,
                          ]}
                        >
                          {transaction.type === 'income' ? '+' : '-'}₹
                          {transaction.amount}
                        </Text>
                        <IconButton
                          icon="delete"
                          size={20}
                          iconColor="#F44336"
                          onPress={() =>
                            handleDeleteTransaction(
                              transaction.id,
                              transaction.description
                            )
                          }
                        />
                      </View>
                    </Card.Content>
                  </Card>
                ))}
              </View>
            ))
          )}
        </View>
      </SafeScrollView>

      {/* Floating Action Button */}
      <FAB
        icon="plus"
        label=""
        style={styles.fab}
        onPress={() => navigation.navigate('AddPersonalTransaction')}
      />

      <LoadingOverlay visible={isProcessing} message="Processing..." />
    </View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 80,
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
  cardNumber: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "bold",
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
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
  incomeText: {
    color: '#4CAF50', // Keep distinct green
  },
  expenseText: {
    color: theme.colors.error,
  },
  neutralText: {
    color: theme.colors.onSurfaceVariant,
  },
  monthCard: {
    marginBottom: 16,
    backgroundColor: theme.colors.surface,
    elevation: 2,
  },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  monthText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.onSurface,
  },
  monthlyStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  statIcon: {
    margin: 0,
    marginRight: -4,
  },
  statTextContainer: {
    flex: 1,
    marginLeft: 0,
  },
  statLabel: {
    fontSize: 10,
    color: theme.colors.onSurfaceVariant,
  },
  statValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  filterButtons: {
    marginBottom: 16,
  },
  transactionsSection: {
    marginBottom: 16,
  },
  emptyCard: {
    backgroundColor: theme.colors.surface,
  },
  emptyContent: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.onSurfaceVariant,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: theme.colors.onSurfaceDisabled,
  },
  dateGroup: {
    marginBottom: 24,
  },
  dateHeader: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.onSurfaceVariant,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  transactionCard: {
    marginBottom: 8,
    backgroundColor: theme.colors.surface,
    elevation: 2,
  },
  transactionContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryIcon: {
    fontSize: 32,
    marginRight: 12,
    color: theme.colors.onSurface,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionDescription: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.onSurface,
    marginBottom: 4,
  },
  categoryChip: {
    alignSelf: 'flex-start',
    height: 24,
    marginBottom: 4,
    borderColor: theme.colors.outline,
  },
  categoryChipText: {
    fontSize: 10,
    marginVertical: 0,
    color: theme.colors.onSurfaceVariant,
  },
  transactionNotes: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    fontStyle: 'italic',
  },
  transactionRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  transactionAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 4,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 64,
    backgroundColor: theme.colors.primary,
  },
});