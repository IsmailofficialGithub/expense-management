// src/screens/main/PersonalFinanceScreen.tsx
import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
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
        {/* Overall Summary */}
        <Card style={styles.summaryCard}>
          <Card.Content>
            <Text style={styles.summaryTitle}>Overall Balance</Text>
            <Text
              style={[
                styles.overallBalance,
                totalSavings > 0
                  ? styles.positiveBalance
                  : totalSavings < 0
                    ? styles.negativeBalance
                    : styles.neutralBalance,
              ]}
            >
              ₹{totalSavings.toFixed(2)}
            </Text>

            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Total Income</Text>
                <Text style={[styles.summaryValue, styles.incomeText]}>
                  ₹{totalIncome.toFixed(0)}
                </Text>
              </View>

              <Divider style={styles.verticalDivider} />

              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Total Expenses</Text>
                <Text style={[styles.summaryValue, styles.expenseText]}>
                  ₹{totalExpenses.toFixed(0)}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

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
                <IconButton icon="arrow-down-circle" size={24} iconColor="#4CAF50" />
                <View>
                  <Text style={styles.statLabel}>Income</Text>
                  <Text style={[styles.statValue, styles.incomeText]}>
                    ₹{monthlyIncome.toFixed(0)}
                  </Text>
                </View>
              </View>

              <View style={styles.statItem}>
                <IconButton icon="arrow-up-circle" size={24} iconColor="#F44336" />
                <View>
                  <Text style={styles.statLabel}>Expenses</Text>
                  <Text style={[styles.statValue, styles.expenseText]}>
                    ₹{monthlyExpenses.toFixed(0)}
                  </Text>
                </View>
              </View>

              <View style={styles.statItem}>
                <IconButton icon="wallet" size={24} iconColor="#2196F3" />
                <View>
                  <Text style={styles.statLabel}>Savings</Text>
                  <Text
                    style={[
                      styles.statValue,
                      monthlySavings > 0
                        ? styles.incomeText
                        : monthlySavings < 0
                          ? styles.expenseText
                          : styles.neutralText,
                    ]}
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
                      navigation.navigate('EditPersonalTransaction', {
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
        label="Add Transaction"
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
  summaryCard: {
    marginBottom: 16,
    backgroundColor: theme.colors.primary,
    elevation: 4,
  },
  summaryTitle: {
    fontSize: 14,
    color: theme.colors.onPrimary,
    opacity: 0.8,
    marginBottom: 8,
  },
  overallBalance: {
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 16,
    color: theme.colors.onPrimary,
  },
  positiveBalance: {
    color: '#A5D6A7', // Light green for visibility on primary dark
  },
  negativeBalance: {
    color: '#EF9A9A', // Light red for visibility on primary dark
  },
  neutralBalance: {
    color: theme.colors.onPrimary,
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
    color: theme.colors.onPrimary,
    opacity: 0.8,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 4,
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
  verticalDivider: {
    width: 1,
    height: 40,
    backgroundColor: theme.colors.onPrimary,
    opacity: 0.3,
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
    justifyContent: 'space-around',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statLabel: {
    fontSize: 11,
    color: theme.colors.onSurfaceVariant,
  },
  statValue: {
    fontSize: 16,
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
    bottom: 0,
    backgroundColor: theme.colors.primary,
  },
});