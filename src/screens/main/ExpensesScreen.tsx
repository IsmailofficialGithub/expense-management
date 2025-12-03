// src/screens/main/ExpensesScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Text, Card, Chip, FAB, Searchbar, IconButton, Menu, Divider, SegmentedButtons } from 'react-native-paper';
import { useExpenses } from '../../hooks/useExpenses';
import { useGroups } from '../../hooks/useGroups';
import { useAuth } from '../../hooks/useAuth';
import { useAppDispatch } from '../../store';
import { fetchExpenses, setFilters, clearFilters } from '../../store/slices/expensesSlice';
import { fetchCategories } from '../../store/slices/expensesSlice';
import { format } from 'date-fns';
import { ErrorHandler } from '../../utils/errorHandler';
import { useToast } from '../../hooks/useToast';
import { useTheme } from 'react-native-paper';
import ErrorState from '../../components/ErrorState';

export default function ExpensesScreen({ navigation }: any) {
  const theme = useTheme();
  const { expenses, categories, filters, loading } = useExpenses();
  const { groups } = useGroups();
  const { profile } = useAuth();
  const dispatch = useAppDispatch();
   const { showToast } = useToast();

  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMenuVisible, setFilterMenuVisible] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'paid' | 'owe'>('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [filters]);

  const loadData = async () => {
    setError(null);
    try {
      await Promise.all([
        dispatch(fetchExpenses(filters)).unwrap(),
        dispatch(fetchCategories()).unwrap(),
      ]);
    } catch (error: any) {
      const errorMessage = ErrorHandler.getUserFriendlyMessage(error);
      setError(errorMessage);
      ErrorHandler.handleError(error, showToast, 'Load Expenses');
    }
  };

  const onRefresh = async () => {
     setRefreshing(true);
    try {
      await loadData();
    } catch (error) {
      ErrorHandler.handleError(error, showToast, 'Refresh Expenses');
    } finally {
      setRefreshing(false);
    }
  };

  const handleFilterChange = (value: string) => {
    setSelectedFilter(value as 'all' | 'paid' | 'owe');
    
    if (value === 'paid') {
      dispatch(setFilters({ ...filters, paid_by: profile?.id }));
    } else if (value === 'owe') {
      // Filter expenses where current user has a split but didn't pay
      dispatch(clearFilters());
    } else {
      dispatch(clearFilters());
    }
  };

  // Filter expenses based on search and selected filter
  const filteredExpenses = expenses.filter(expense => {
    const matchesSearch = expense.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (selectedFilter === 'paid') {
      return matchesSearch && expense.paid_by === profile?.id;
    } else if (selectedFilter === 'owe') {
      const hasMySplit = expense.splits?.some(s => s.user_id === profile?.id);
      return matchesSearch && hasMySplit && expense.paid_by !== profile?.id;
    }
    
    return matchesSearch;
  });

  // Group expenses by date
  const groupedExpenses = filteredExpenses.reduce((acc: any, expense) => {
    const date = format(new Date(expense.date), 'MMMM dd, yyyy');
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(expense);
    return acc;
  }, {});

const renderExpenseCard = (expense: any) => {
    const isPaidByMe = expense.paid_by === profile?.id;
    const mySplit = expense.splits?.find((s: { user_id: string; amount: number }) =>
      s.user_id === profile?.id
    );

    // Calculate the amount relevant to the user
    const myShare = mySplit ? Number(mySplit.amount) : 0;
    const amountDisplay = isPaidByMe 
      ? Number(expense.amount) - myShare // Amount I get back
      : myShare; // Amount I owe

    return (
      <Card
        key={expense.id}
        style={styles.expenseCard}
        onPress={() => {
          navigation.navigate('ExpenseDetails', { expenseId: expense.id });
        }}
      >
        <Card.Content style={styles.cardContent}>
          <View style={styles.cardRow}>
            {/* 1. Category Icon (Circular Avatar) */}
            <View style={[styles.iconContainer, { backgroundColor: theme.colors.elevation.level2 }]}>
              <Text style={styles.emojiIcon}>{expense.category?.icon || '🧾'}</Text>
            </View>

            {/* 2. Main Details (Description & Group/Payer) */}
            <View style={styles.detailsContainer}>
              <Text 
                style={[styles.expenseTitle, { color: theme.colors.onSurface }]} 
                numberOfLines={1}
              >
                {expense.description}
              </Text>
              
              <View style={styles.subDetailRow}>
                 {/* Group Name */}
                <Text style={[styles.groupName, { color: theme.colors.onSurfaceVariant }]}>
                  {groups.find(g => g.id === expense.group_id)?.name}
                </Text>
                <Text style={[styles.dotSeparator, { color: theme.colors.onSurfaceVariant }]}>•</Text>
                {/* Payer Info */}
                <Text style={[styles.payerName, { color: theme.colors.onSurfaceVariant }]}>
                  {isPaidByMe ? 'You paid' : `${expense.paid_by_user?.full_name?.split(' ')[0]} paid`}
                </Text>
              </View>
            </View>

            {/* 3. Financials (Right Side) */}
            <View style={styles.amountContainer}>
              {/* Primary Number: Impact on YOU */}
              <Text
                style={[
                  styles.impactAmount,
                  isPaidByMe ? styles.positiveText : styles.negativeText
                ]}
              >
                {isPaidByMe ? '+' : '-'}₹{amountDisplay.toFixed(0)}
              </Text>
              
              {/* Secondary Number: Total Bill */}
              <Text style={[styles.totalBillLabel, { color: theme.colors.onSurfaceDisabled }]}>
                Total: ₹{expense.amount}
              </Text>
            </View>
          </View>
        </Card.Content>
      </Card>
    );
  };
  const renderSection = ({ item }: any) => {
    const [date, expensesList] = item;
    
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionHeader, { color: theme.colors.onSurfaceVariant }]}>{date}</Text>
        {expensesList.map(renderExpenseCard)}
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <IconButton icon="receipt-text-outline" size={80} iconColor={theme.colors.onSurfaceDisabled} />
      <Text style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>No Expenses Yet</Text>
      <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
        Start adding expenses to track your spending
      </Text>
    </View>
  );

  const sectionsData = Object.entries(groupedExpenses);

  // Show error state if there's an error and no expenses
  if (error && expenses.length === 0 && !loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
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
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search expenses"
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
        />
        <Menu
          visible={filterMenuVisible}
          onDismiss={() => setFilterMenuVisible(false)}
          anchor={
            <IconButton
              icon="filter-variant"
              size={24}
              onPress={() => setFilterMenuVisible(true)}
            />
          }
        >
          <Menu.Item onPress={() => {}} title="Filter by Category" />
          <Menu.Item onPress={() => {}} title="Filter by Group" />
          <Menu.Item onPress={() => {}} title="Date Range" />
          <Divider />
          <Menu.Item 
            onPress={() => {
              dispatch(clearFilters());
              setFilterMenuVisible(false);
            }} 
            title="Clear Filters" 
          />
        </Menu>
      </View>

      {/* Filter Tabs */}
      <SegmentedButtons
        value={selectedFilter}
        onValueChange={handleFilterChange}
        buttons={[
          { value: 'all', label: 'All' },
          { value: 'paid', label: 'I Paid' },
          { value: 'owe', label: 'I Owe' },
        ]}
        style={styles.segmentedButtons}
      />

      {/* Expenses List */}
      <FlatList
        data={sectionsData}
        renderItem={renderSection}
        keyExtractor={(item) => item[0]}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />

      {/* Floating Action Buttons */}
      <View style={styles.fabContainer}>
        <FAB
          icon="food"
          style={[styles.fab, styles.fabSecondary, styles.fabSpacing]}
          onPress={() => {
            navigation.navigate('AddFoodExpense');
          }}
          size="small"
        />
        <FAB
          icon="plus"
          style={styles.fab}
          onPress={() => {
            navigation.navigate('AddExpense');
          }}
          size="small"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  searchBar: {
    flex: 1,
    elevation: 2,
  },
  segmentedButtons: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 80,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
 expenseCard: {
    marginBottom: 10,
    // backgroundColor: 'white',
    borderRadius: 16, // Softer corners
    elevation: 1, // Subtle shadow
  },
  cardContent: {
    padding: 12,
    paddingVertical: 14,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  emojiIcon: {
    fontSize: 24,
  },
  
  // Middle: Details
  detailsContainer: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 8,
  },
  expenseTitle: {
    fontSize: 16,
    fontWeight: '700', // Bold title
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  subDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupName: {
    fontSize: 12,
    fontWeight: '500',
    maxWidth: 80, // Limit width so it doesn't push payer name too far
  },
  dotSeparator: {
    marginHorizontal: 4,
    fontSize: 12,
  },
  payerName: {
    fontSize: 12,
  },

  // Right: Amounts
  amountContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 70,
  },
  impactAmount: {
    fontSize: 18,
    fontWeight: '800', // Very bold for the money
    marginBottom: 2,
  },
  positiveText: {
    color: '#4CAF50', // Green
  },
  negativeText: {
    color: '#F44336', // Red
  },
  totalBillLabel: {
    fontSize: 11,
    fontWeight: '500',
  },

  // --- FAB & Empty States ---
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    opacity: 0.7,
  },
  fabContainer: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    alignItems: 'flex-end',
  },
  fab: {
    backgroundColor: '#6200EE',
    borderRadius: 16,
  },
  fabSecondary: {
    backgroundColor: '#4CAF50',
    borderRadius: 16,
  },
  fabSpacing: {
    marginBottom: 16,
  },
  expenseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    fontWeight: '600',
    marginBottom: 4,
  },
  expenseMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryChip: {
    height: 24,
    backgroundColor: '#E8DEF8',
  },
  categoryChipText: {
    fontSize: 11,
    marginVertical: 0,
    color: '#6200EE',
  },
  expenseGroup: {
    fontSize: 12,
    marginLeft: 8,
  },
  chevron: {
    margin: 0,
  },
  divider: {
    marginVertical: 12,
  },
  expenseFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  amountLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  splitContainer: {
    alignItems: 'center',
  },
  splitAmount: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  positiveAmount: {
    color: '#4CAF50',
  },
  negativeAmount: {
    color: '#F44336',
  },
  splitLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  paidByContainer: {
    alignItems: 'flex-end',
  },
  paidByLabel: {
    fontSize: 12,
  },
 
});