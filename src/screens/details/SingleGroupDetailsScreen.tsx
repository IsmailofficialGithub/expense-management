import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, StatusBar, Alert } from 'react-native';
import { Text, Card, Avatar, Button, IconButton, Chip, Divider, FAB, List, SegmentedButtons } from 'react-native-paper';
import { useGroups } from '../../hooks/useGroups';
import { useExpenses } from '../../hooks/useExpenses';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useNetworkCheck } from '../../hooks/useNetworkCheck';
import { useAppDispatch } from '../../store';
import { fetchGroup, fetchGroupBalances } from '../../store/slices/groupsSlice';
import { fetchExpenses } from '../../store/slices/expensesSlice';
import { ErrorHandler } from '../../utils/errorHandler';
import LoadingOverlay from '../../components/LoadingOverlay';
import { format } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from 'react-native-paper';

interface Props {
    navigation: any;
    route: {
        params: {
            groupId: string;
        };
    };
}

export default function SingleGroupDetailsScreen({ navigation, route }: Props) {
    const { groupId } = route.params;
    const theme = useTheme();
    const { selectedGroup, balances, loading } = useGroups();
    const { expenses } = useExpenses();
    const { profile } = useAuth();
    const { showToast } = useToast();
    const { isOnline } = useNetworkCheck();
    const dispatch = useAppDispatch();
    const insets = useSafeAreaInsets();

    const [refreshing, setRefreshing] = useState(false);
    const [filterType, setFilterType] = useState<'all' | 'pending' | 'settled'>('all');
    const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');

    useEffect(() => {
        loadGroupData();
    }, [groupId]);

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

    if (!selectedGroup) {
        return (
            <View style={styles.loadingContainer}>
                <LoadingOverlay visible={true} message="Loading group details..." />
            </View>
        );
    }

    const groupExpenses = expenses.filter(e => e.group_id === groupId);

    // Filter expenses based on settled status
    const filteredExpenses = groupExpenses.filter(expense => {
        if (filterType === 'all') return true;
        const allSettled = expense.splits?.every(s => s.is_settled) || false;
        return filterType === 'settled' ? allSettled : !allSettled;
    });

    // Sort expenses
    const sortedExpenses = [...filteredExpenses].sort((a, b) => {
        if (sortBy === 'date') {
            return new Date(b.date).getTime() - new Date(a.date).getTime();
        } else {
            return Number(b.amount) - Number(a.amount);
        }
    });

    const totalExpenses = groupExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
    const settledExpenses = groupExpenses.filter(e => e.splits?.every(s => s.is_settled));
    const pendingExpenses = groupExpenses.filter(e => e.splits?.some(s => !s.is_settled));
    const myBalance = balances.find(b => b.user_id === profile?.id);

    // Calculate my contribution
    const myTotalPaid = groupExpenses
        .filter(e => e.paid_by === profile?.id)
        .reduce((sum, exp) => sum + Number(exp.amount), 0);

    const myTotalShare = groupExpenses
        .reduce((sum, exp) => {
            const mySplit = exp.splits?.find(s => s.user_id === profile?.id);
            return sum + (mySplit ? Number(mySplit.amount) : 0);
        }, 0);

    // Get category breakdown
    const categoryBreakdown = groupExpenses.reduce((acc, expense) => {
        const categoryName = expense.category?.name || 'Other';
        if (!acc[categoryName]) {
            acc[categoryName] = {
                total: 0,
                count: 0,
                icon: expense.category?.icon || '💰',
            };
        }
        acc[categoryName].total += Number(expense.amount);
        acc[categoryName].count += 1;
        return acc;
    }, {} as Record<string, { total: number; count: number; icon: string }>);

    const navigateToExpenseDetails = (expenseId: string) => {
        navigation.navigate('ExpenseDetails', { expenseId });
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <StatusBar barStyle="light-content" backgroundColor="#6200EE" translucent={false} />
            <ScrollView
                contentContainerStyle={styles.content}
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
                                style={[styles.avatar, { backgroundColor: theme.colors.primary }]}
                            />
                            <View style={styles.headerText}>
                                <Text style={[styles.groupName, { color: theme.colors.onSurface }]}>
                                    {selectedGroup.name}
                                </Text>
                                {selectedGroup.description && (
                                    <Text style={[styles.groupDescription, { color: theme.colors.onSurfaceVariant }]}>
                                        {selectedGroup.description}
                                    </Text>
                                )}
                            </View>
                        </View>
                    </Card.Content>
                </Card>

                {/* Statistics Summary */}
                <Card style={styles.statsCard}>
                    <Card.Content>
                        <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                            Overview
                        </Text>

                        <View style={styles.statsGrid}>
                            <View style={styles.statItem}>
                                <Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>
                                    Total Expenses
                                </Text>
                                <Text style={[styles.statValue, { color: theme.colors.onSurface }]}>
                                    ₹{totalExpenses.toFixed(2)}
                                </Text>
                                <Text style={[styles.statCount, { color: theme.colors.onSurfaceVariant }]}>
                                    {groupExpenses.length} transactions
                                </Text>
                            </View>

                            <View style={styles.statItem}>
                                <Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>
                                    Your Balance
                                </Text>
                                <Text
                                    style={[
                                        styles.statValue,
                                        myBalance && myBalance.balance > 0
                                            ? styles.positiveBalance
                                            : myBalance && myBalance.balance < 0
                                                ? styles.negativeBalance
                                                : styles.neutralBalance,
                                    ]}
                                >
                                    {myBalance ? `₹${myBalance.balance.toFixed(2)}` : '₹0.00'}
                                </Text>
                                <Text style={[styles.statCount, { color: theme.colors.onSurfaceVariant }]}>
                                    {myBalance && myBalance.balance > 0 ? 'You are owed' : myBalance && myBalance.balance < 0 ? 'You owe' : 'Settled up'}
                                </Text>
                            </View>
                        </View>

                        <Divider style={styles.divider} />

                        <View style={styles.statsGrid}>
                            <View style={styles.statItem}>
                                <Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>
                                    You Paid
                                </Text>
                                <Text style={[styles.statValue, { color: theme.colors.primary }]}>
                                    ₹{myTotalPaid.toFixed(2)}
                                </Text>
                            </View>

                            <View style={styles.statItem}>
                                <Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>
                                    Your Share
                                </Text>
                                <Text style={[styles.statValue, { color: theme.colors.primary }]}>
                                    ₹{myTotalShare.toFixed(2)}
                                </Text>
                            </View>
                        </View>
                    </Card.Content>
                </Card>

                {/* Category Breakdown */}
                {Object.keys(categoryBreakdown).length > 0 && (
                    <Card style={styles.categoryCard}>
                        <Card.Content>
                            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                                Category Breakdown
                            </Text>

                            {Object.entries(categoryBreakdown)
                                .sort(([, a], [, b]) => b.total - a.total)
                                .map(([category, data]) => {
                                    const percentage = ((data.total / totalExpenses) * 100).toFixed(1);
                                    return (
                                        <View key={category} style={styles.categoryItem}>
                                            <View style={styles.categoryLeft}>
                                                <Text style={styles.categoryIcon}>{data.icon}</Text>
                                                <View style={styles.categoryInfo}>
                                                    <Text style={[styles.categoryName, { color: theme.colors.onSurface }]}>
                                                        {category}
                                                    </Text>
                                                    <Text style={[styles.categoryCount, { color: theme.colors.onSurfaceVariant }]}>
                                                        {data.count} {data.count === 1 ? 'expense' : 'expenses'}
                                                    </Text>
                                                </View>
                                            </View>
                                            <View style={styles.categoryRight}>
                                                <Text style={[styles.categoryAmount, { color: theme.colors.onSurface }]}>
                                                    ₹{data.total.toFixed(2)}
                                                </Text>
                                                <Text style={[styles.categoryPercentage, { color: theme.colors.onSurfaceVariant }]}>
                                                    {percentage}%
                                                </Text>
                                            </View>
                                        </View>
                                    );
                                })}
                        </Card.Content>
                    </Card>
                )}

                {/* Expense Filters */}
                <View style={styles.filtersSection}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                        Expenses
                    </Text>

                    <View style={styles.filterButtons}>
                        <SegmentedButtons
                            value={filterType}
                            onValueChange={(value) => setFilterType(value as 'all' | 'pending' | 'settled')}
                            buttons={[
                                { value: 'all', label: `All (${groupExpenses.length})` },
                                { value: 'pending', label: `Pending (${pendingExpenses.length})` },
                                { value: 'settled', label: `Settled (${settledExpenses.length})` },
                            ]}
                            style={styles.segmentedButtons}
                        />
                    </View>

                    <View style={styles.sortSection}>
                        <Text style={[styles.sortLabel, { color: theme.colors.onSurfaceVariant }]}>
                            Sort by:
                        </Text>
                        <View style={styles.sortButtons}>
                            <Chip
                                selected={sortBy === 'date'}
                                onPress={() => setSortBy('date')}
                                style={styles.sortChip}
                            >
                                Date
                            </Chip>
                            <Chip
                                selected={sortBy === 'amount'}
                                onPress={() => setSortBy('amount')}
                                style={styles.sortChip}
                            >
                                Amount
                            </Chip>
                        </View>
                    </View>
                </View>

                {/* Expenses List */}
                {sortedExpenses.length === 0 ? (
                    <Card style={styles.emptyCard}>
                        <Card.Content style={styles.emptyContent}>
                            <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
                                No expenses found
                            </Text>
                            <Text style={[styles.emptySubtext, { color: theme.colors.onSurfaceDisabled }]}>
                                {filterType !== 'all'
                                    ? `No ${filterType} expenses in this group`
                                    : 'Add your first expense to get started'}
                            </Text>
                        </Card.Content>
                    </Card>
                ) : (
                    sortedExpenses.map((expense) => {
                        const isPaidByMe = expense.paid_by === profile?.id;
                        const mySplit = expense.splits?.find(s => s.user_id === profile?.id);
                        const myShare = mySplit ? Number(mySplit.amount) : 0;
                        const allSettled = expense.splits?.every(s => s.is_settled) || false;

                        return (
                            <Card
                                key={expense.id}
                                style={styles.expenseCard}
                                onPress={() => navigateToExpenseDetails(expense.id)}
                            >
                                <Card.Content style={styles.expenseContent}>
                                    <View style={styles.expenseLeft}>
                                        <Text style={styles.categoryIcon}>
                                            {expense.category?.icon || '💰'}
                                        </Text>
                                        <View style={styles.expenseInfo}>
                                            <Text style={[styles.expenseDescription, { color: theme.colors.onSurface }]}>
                                                {expense.description}
                                            </Text>
                                            <Text style={[styles.expenseDate, { color: theme.colors.onSurfaceVariant }]}>
                                                {format(new Date(expense.date), 'MMM dd, yyyy')} • {expense.category?.name || 'Other'}
                                            </Text>
                                            <View style={styles.expenseMetaRow}>
                                                <Text style={[styles.expensePaidBy, { color: theme.colors.onSurfaceVariant }]}>
                                                    {isPaidByMe
                                                        ? 'You paid'
                                                        : `${expense.paid_by_user?.full_name || 'Someone'} paid`}
                                                </Text>
                                                {allSettled && (
                                                    <Chip
                                                        icon="check"
                                                        style={styles.settledBadgeSmall}
                                                        textStyle={styles.settledBadgeTextSmall}
                                                        compact
                                                    >
                                                        Settled
                                                    </Chip>
                                                )}
                                            </View>
                                        </View>
                                    </View>
                                    <View style={styles.expenseRight}>
                                        <Text style={[styles.expenseAmount, { color: theme.colors.onSurface }]}>
                                            ₹{Number(expense.amount).toFixed(2)}
                                        </Text>
                                        <Text
                                            style={[
                                                styles.expenseShare,
                                                isPaidByMe ? styles.positiveShare : styles.negativeShare,
                                            ]}
                                        >
                                            {isPaidByMe ? '+' : '-'}₹{myShare.toFixed(2)}
                                        </Text>
                                    </View>
                                </Card.Content>
                            </Card>
                        );
                    })
                )}
            </ScrollView>

            {/* Floating Action Button */}
            <FAB
                icon="plus"
                style={[styles.fab, { backgroundColor: theme.colors.primary }]}
                onPress={() => navigation.navigate('AddExpense', { groupId })}
            />

            <LoadingOverlay visible={loading} message="Loading..." />
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
        paddingBottom: 100,
    },
    headerCard: {
        marginBottom: 16,
        elevation: 2,
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
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
    },
    statsCard: {
        marginBottom: 16,
        elevation: 2,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 16,
    },
    statsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        gap: 16,
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    statLabel: {
        fontSize: 12,
        marginBottom: 4,
    },
    statValue: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    statCount: {
        fontSize: 11,
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
    divider: {
        marginVertical: 16,
    },
    categoryCard: {
        marginBottom: 16,
        elevation: 2,
    },
    categoryItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    categoryLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    categoryIcon: {
        fontSize: 32,
        marginRight: 12,
    },
    categoryInfo: {
        flex: 1,
    },
    categoryName: {
        fontSize: 16,
        fontWeight: '600',
    },
    categoryCount: {
        fontSize: 12,
        marginTop: 2,
    },
    categoryRight: {
        alignItems: 'flex-end',
    },
    categoryAmount: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    categoryPercentage: {
        fontSize: 12,
        marginTop: 2,
    },
    filtersSection: {
        marginBottom: 16,
    },
    filterButtons: {
        marginBottom: 12,
    },
    segmentedButtons: {
        marginBottom: 8,
    },
    sortSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    sortLabel: {
        fontSize: 14,
    },
    sortButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    sortChip: {
        height: 32,
    },
    emptyCard: {
        elevation: 2,
    },
    emptyContent: {
        alignItems: 'center',
        padding: 32,
    },
    emptyText: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
        textAlign: 'center',
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
    expenseInfo: {
        flex: 1,
    },
    expenseDescription: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
    },
    expenseDate: {
        fontSize: 12,
        marginBottom: 4,
    },
    expenseMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    expensePaidBy: {
        fontSize: 12,
    },
    expenseRight: {
        alignItems: 'flex-end',
    },
    expenseAmount: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    expenseShare: {
        fontSize: 14,
        fontWeight: '600',
    },
    positiveShare: {
        color: '#4CAF50',
    },
    negativeShare: {
        color: '#F44336',
    },
    settledBadgeSmall: {
        height: 20,
        backgroundColor: '#C8E6C9',
    },
    settledBadgeTextSmall: {
        fontSize: 10,
        color: '#2E7D32',
    },
    fab: {
        position: 'absolute',
        margin: 16,
        right: 0,
        bottom: 0,
    },
});
