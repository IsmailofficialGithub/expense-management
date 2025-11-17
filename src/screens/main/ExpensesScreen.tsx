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

export default function ExpensesScreen({ navigation }: any) {
  const { expenses, categories, filters, loading } = useExpenses();
  const { groups } = useGroups();
  const { profile } = useAuth();
  const dispatch = useAppDispatch();
   const { showToast } = useToast();

  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMenuVisible, setFilterMenuVisible] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'paid' | 'owe'>('all');

  useEffect(() => {
    loadData();
  }, [filters]);

  const loadData = async () => {
    await Promise.all([
      dispatch(fetchExpenses(filters)),
      dispatch(fetchCategories()),
    ]);
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

    const myShare = mySplit ? Number(mySplit.amount) : 0;

    return (
      <Card 
        key={expense.id}
        style={styles.expenseCard}
        onPress={() => {
          // TODO: Navigate to ExpenseDetailsScreen
          console.log('Navigate to expense:', expense.id);
        }}
      >
        <Card.Content style={styles.cardContent}>
          <View style={styles.expenseHeader}>
            <View style={styles.expenseLeft}>
              <Text style={styles.categoryIcon}>{expense.category?.icon || '💰'}</Text>
              <View style={styles.expenseInfo}>
                <Text style={styles.expenseDescription}>{expense.description}</Text>
                <View style={styles.expenseMeta}>
                  <Chip 
                    mode="flat" 
                    style={styles.categoryChip}
                    textStyle={styles.categoryChipText}
                  >
                    {expense.category?.name || 'Other'}
                  </Chip>
                  <Text style={styles.expenseGroup}>
                    • {groups.find(g => g.id === expense.group_id)?.name || 'Unknown Group'}
                  </Text>
                </View>
              </View>
            </View>
            <IconButton icon="chevron-right" size={20} style={styles.chevron} />
          </View>

          <Divider style={styles.divider} />

          <View style={styles.expenseFooter}>
            <View style={styles.amountContainer}>
              <Text style={styles.totalAmount}>₹{expense.amount}</Text>
              <Text style={styles.amountLabel}>Total</Text>
            </View>

            <View style={styles.splitContainer}>
              {isPaidByMe ? (
                <>
                  <Text style={[styles.splitAmount, styles.positiveAmount]}>
                    +₹{(Number(expense.amount) - myShare).toFixed(2)}
                  </Text>
                  <Text style={styles.splitLabel}>You lent</Text>
                </>
              ) : (
                <>
                  <Text style={[styles.splitAmount, styles.negativeAmount]}>
                    -₹{myShare.toFixed(2)}
                  </Text>
                  <Text style={styles.splitLabel}>You owe</Text>
                </>
              )}
            </View>

            <View style={styles.paidByContainer}>
              <Text style={styles.paidByLabel}>
                {isPaidByMe ? 'You paid' : `${expense.paid_by_user?.full_name || 'Someone'} paid`}
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
        <Text style={styles.sectionHeader}>{date}</Text>
        {expensesList.map(renderExpenseCard)}
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <IconButton icon="receipt-text-outline" size={80} iconColor="#ccc" />
      <Text style={styles.emptyTitle}>No Expenses Yet</Text>
      <Text style={styles.emptyText}>
        Start adding expenses to track your spending
      </Text>
    </View>
  );

  const sectionsData = Object.entries(groupedExpenses);

  return (
    <View style={styles.container}>
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

      {/* Floating Action Button */}
      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => {
          // TODO: Navigate to AddExpenseScreen
          console.log('Add expense');
        }}
        label="Add Expense"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
    color: '#666',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  expenseCard: {
    marginBottom: 12,
    backgroundColor: '#fff',
    elevation: 2,
  },
  cardContent: {
    padding: 16,
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
    color: '#333',
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
    color: '#666',
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
  amountContainer: {
    alignItems: 'flex-start',
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  amountLabel: {
    fontSize: 11,
    color: '#666',
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
    color: '#666',
    marginTop: 2,
  },
  paidByContainer: {
    alignItems: 'flex-end',
  },
  paidByLabel: {
    fontSize: 12,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: '#6200EE',
  },
});