import React, { useEffect, useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, StatusBar } from 'react-native';
import { Text, Card, Avatar, Button, Portal, Modal, TextInput } from 'react-native-paper';
import { useGroups } from '../../hooks/useGroups';
import { useExpenses } from '../../hooks/useExpenses';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useNetworkCheck } from '../../hooks/useNetworkCheck';
import { useAppDispatch } from '../../store';
import { fetchGroup, fetchGroupBalances } from '../../store/slices/groupsSlice';
import { fetchExpenses, fetchSettlements, settleUp as settleUpAction } from '../../store/slices/expensesSlice';
import { ErrorHandler } from '../../utils/errorHandler';
import { format, startOfWeek, endOfWeek, isToday, isYesterday } from 'date-fns';
import { useTheme } from 'react-native-paper';
import { CsvService } from '../../services/csv.service';

interface Props {
    navigation: any;
    route: {
        params: {
            groupId: string;
            userId: string;
            userName?: string;
        };
    };
}

export default function GroupMemberDetailsScreen({ navigation, route }: Props) {
    const { groupId, userId, userName } = route.params;
    const theme = useTheme();
    const { selectedGroup, balances } = useGroups();
    const { expenses, settlements } = useExpenses();
    const { profile } = useAuth();
    const { showToast } = useToast();
    const { isOnline } = useNetworkCheck();
    const dispatch = useAppDispatch();

    const [refreshing, setRefreshing] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [settleModalVisible, setSettleModalVisible] = useState(false);
    const [receiveModalVisible, setReceiveModalVisible] = useState(false);
    const [settleAmount, setSettleAmount] = useState('');
    const [settleNotes, setSettleNotes] = useState('');

    const otherUser = useMemo(() => {
        return selectedGroup?.members?.find((m: any) => m.user_id === userId)?.user || { full_name: userName || 'User', email: '', id: userId, avatar_url: null };
    }, [selectedGroup, userId, userName]);

    useEffect(() => {
        loadData();
    }, [groupId]);

    const loadData = async () => {
        if (!isOnline) return;
        try {
            await Promise.all([
                dispatch(fetchExpenses({ group_id: groupId })).unwrap(),
                dispatch(fetchSettlements(groupId)).unwrap(),
                dispatch(fetchGroup(groupId)).unwrap(),
                dispatch(fetchGroupBalances(groupId)).unwrap(),
            ]);
        } catch (error) {
            ErrorHandler.handleError(error, showToast, 'Load Data');
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const allTransactions = useMemo(() => {
        if (!profile) return [];

        // Expenses where both users are involved (I paid and they split, OR they paid and I split)
        const relevantExpenses = expenses.filter(expense => {
            const iPaid = expense.paid_by === profile.id;
            const theyPaid = expense.paid_by === userId;
            
            // Check if they have a split when I paid, or I have a split when they paid
            const theyHaveSplit = expense.splits?.some((s: any) => s.user_id === userId);
            const iHaveSplit = expense.splits?.some((s: any) => s.user_id === profile.id);
            
            return (iPaid && theyHaveSplit) || (theyPaid && iHaveSplit);
        }).map(e => ({ ...e, type: 'expense' as const }));

        // Settlements where (I paid them) OR (They paid me)
        const relevantSettlements = settlements.filter(settlement => {
            const iPaid = settlement.from_user === profile.id;
            const theyReceived = settlement.to_user === userId;
            const theyPaid = settlement.from_user === userId;
            const iReceived = settlement.to_user === profile.id;
            return (iPaid && theyReceived) || (theyPaid && iReceived);
        }).map(s => ({
            ...s,
            date: s.settled_at,
            type: 'settlement' as const,
            description: 'Payment Settlement',
            paid_by_user: s.from_user === profile.id ? profile : otherUser
        }));

        return [...relevantExpenses, ...relevantSettlements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [expenses, settlements, profile, userId, otherUser]);

    console.log('=== ALL TRANSACTIONS ===');
    console.log('Transactions count:', allTransactions.length);
    allTransactions.slice(0, 10).forEach((t, i) => {
        const settledAt = t.type === 'settlement' ? t.settled_at : 'N/A';
        console.log(`${i + 1}. ${t.type === 'settlement' ? 'SETTLEMENT' : 'EXPENSE'}: ${t.description || 'Payment'} - Date: ${t.date} - settled_at: ${settledAt}`);
    });

    const pairwiseBalance = useMemo(() => {
        if (!profile) return 0;

        // Calculate balance based on filtered transactions (only between these two users)
        let calculatedBalance = 0;


        // Calculate from expenses - include ALL expenses where both are involved (settled and unsettled)
        expenses.forEach(expense => {
            const iPaid = expense.paid_by === profile.id;
            const theyPaid = expense.paid_by === userId;

            if (iPaid) {
                // I paid - check if they have a split
                const theirSplit = expense.splits?.find((s: any) => s.user_id === userId);
                if (theirSplit) {
                    calculatedBalance += theirSplit.amount; // Positive = they owe me
                }
            } else if (theyPaid) {
                // They paid - check if I have a split
                const mySplit = expense.splits?.find((s: any) => s.user_id === profile.id);
                if (mySplit) {
                    calculatedBalance -= mySplit.amount; // Negative = I owe them
                }
            }
        });

        // Adjust for settlements between us two
        const settlementsReceived = settlements
            .filter(s => s.from_user === userId && s.to_user === profile.id)  // They paid you
            .reduce((sum, s) => sum + s.amount, 0);

        const settlementsPaid = settlements
            .filter(s => s.from_user === profile.id && s.to_user === userId)  // You paid them
            .reduce((sum, s) => sum + s.amount, 0);

        console.log('=== BALANCE DEBUG ===');
        console.log('userId:', userId);
        console.log('profile.id:', profile.id);
        console.log('Calculated balance from expenses:', calculatedBalance);
        console.log('Settlements from them to me:', settlementsReceived);
        console.log('Settlements from me to them:', settlementsPaid);

        // When you owe them (negative balance), paying them (settlementsPaid) reduces the debt
        // Example: You owe -4000, you pay 3701.5 → -4000 + 3701.5 = -298.5 (still owe 298.5)
        // When they owe you (positive balance), they pay you (settlementsReceived) reduces what they owe
        // Example: They owe +1000, they pay 500 → +1000 - 500 = +500 (still owe you 500)
        const adjustedBalance = calculatedBalance - settlementsReceived + settlementsPaid;

        console.log('Final adjustedBalance:', adjustedBalance);
        console.log('===================');

        return adjustedBalance;
    }, [expenses, settlements, profile, userId]);

    // Get unsettled expenses where I paid (They owe me)
    const unsettledDebtsTheyOwe = useMemo(() => {
        if (!profile) return [];
        return expenses.filter(expense => {
            if (expense.paid_by !== profile.id) return false;
            const theirSplit = expense.splits?.find((s: any) => s.user_id === userId);
            return theirSplit && !theirSplit.is_settled;
        });
    }, [expenses, profile, userId]);

    // Get unsettled expenses where They paid (I owe them)
    const unsettledDebtsIOwe = useMemo(() => {
        if (!profile) return [];
        return expenses.filter(expense => {
            if (expense.paid_by !== userId) return false;
            const mySplit = expense.splits?.find((s: any) => s.user_id === profile.id);
            return mySplit && !mySplit.is_settled;
        });
    }, [expenses, profile, userId]);

    const handleSettleUp = async () => {
        if (!settleAmount || isNaN(Number(settleAmount))) {
            showToast('Please enter a valid amount', 'error');
            return;
        }

        setIsProcessing(true);
        try {
            const amount = Number(settleAmount);
            // Include related expenses if paying full amount of debt
            // Note: Simplistic matching. Ideally user selects expenses.
            // For now, if paying, we don't auto-settle my debt splits unless explicitly requested?
            // The prompt asked for "person that pay on his behafe that clear all his dept once" -> Receive case.
            // I will leave Pay case as is, or maybe add ids if it matches balance?
            // Let's add ids for I Owe Them to be consistent.
            const relatedIds = unsettledDebtsIOwe.map(e => e.id);

            await dispatch(settleUpAction({
                group_id: groupId,
                from_user: profile!.id,  // You are paying
                to_user: userId,  // They are receiving
                amount: amount,
                notes: settleNotes || undefined,
                related_expense_ids: relatedIds // Mark my debts as settled
            })).unwrap();

            showToast('Settled up successfully!', 'success');
            setSettleModalVisible(false);
            setSettleAmount('');
            setSettleNotes('');
            loadData();
        } catch (error) {
            ErrorHandler.handleError(error, showToast, 'Settle Up');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleReceiveSettlement = async () => {
        if (!settleAmount || isNaN(Number(settleAmount))) {
            showToast('Please enter a valid amount', 'error');
            return;
        }

        setIsProcessing(true);
        try {
            const amount = Number(settleAmount);
            const relatedIds = unsettledDebtsTheyOwe.map(e => e.id);

            await dispatch(settleUpAction({
                group_id: groupId,
                from_user: userId, // They pay
                to_user: profile!.id, // Me
                amount: amount,
                notes: settleNotes || 'Settled all debts',
                related_expense_ids: relatedIds
            })).unwrap();

            showToast('Marked as settled successfully!', 'success');
            setReceiveModalVisible(false);
            setSettleAmount('');
            setSettleNotes('');
            loadData();
        } catch (error) {
            ErrorHandler.handleError(error, showToast, 'Receive Settlement');
        } finally {
            setIsProcessing(false);
        }
    };

    const openSettleModal = () => {
        setSettleAmount(Math.abs(pairwiseBalance).toFixed(2));
        setSettleModalVisible(true);
    };

    const openReceiveModal = () => {
        setSettleAmount(Math.abs(pairwiseBalance).toFixed(2));
        setReceiveModalVisible(true);
    };

    const downloadReport = async () => {
        try {
            await CsvService.generateAndShareExpenseReport(
                allTransactions as any,
                `activity_${otherUser.full_name?.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}`
            );
        } catch (error) {
            showToast('Failed to download report', 'error');
        }
    };

    // Group transactions by week and day
    const groupedTransactions = useMemo(() => {
        const grouped: { [weekKey: string]: { label: string; days: { [dayKey: string]: { label: string; transactions: any[] } } } } = {};

        allTransactions.forEach(transaction => {
            const transactionDate = new Date(transaction.date);
            const weekStart = startOfWeek(transactionDate, { weekStartsOn: 1 });
            const weekEnd = endOfWeek(transactionDate, { weekStartsOn: 1 });

            const weekKey = format(weekStart, 'yyyy-MM-dd');
            const weekLabel = `${format(weekStart, 'MMM dd')} - ${format(weekEnd, 'MMM dd, yyyy')}`;

            if (!grouped[weekKey]) {
                grouped[weekKey] = {
                    label: weekLabel,
                    days: {}
                };
            }

            const dayKey = format(transactionDate, 'yyyy-MM-dd');
            let dayLabel = '';
            if (isToday(transactionDate)) {
                dayLabel = 'Today';
            } else if (isYesterday(transactionDate)) {
                dayLabel = 'Yesterday';
            } else {
                dayLabel = format(transactionDate, 'EEEE');
            }

            if (!grouped[weekKey].days[dayKey]) {
                grouped[weekKey].days[dayKey] = {
                    label: dayLabel,
                    transactions: []
                };
            }

            grouped[weekKey].days[dayKey].transactions.push(transaction);
        });

        // Sort transactions within each day by date/time (newest first)
        Object.values(grouped).forEach(week => {
            Object.values(week.days).forEach(day => {
                day.transactions.sort((a, b) => {
                    const dateA = new Date(a.type === 'settlement' ? a.settled_at : a.date);
                    const dateB = new Date(b.type === 'settlement' ? b.settled_at : b.date);
                    return dateB.getTime() - dateA.getTime();
                });
            });
        });

        return grouped;
    }, [allTransactions]);

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <StatusBar barStyle="light-content" backgroundColor="#6200EE" translucent={false} />

            <View style={styles.profileHeader}>
                {otherUser?.avatar_url ? (
                    <Avatar.Image
                        size={80}
                        source={{ uri: otherUser.avatar_url }}
                        style={styles.avatar}
                    />
                ) : (
                    <Avatar.Text
                        size={80}
                        label={otherUser?.full_name?.substring(0, 2).toUpperCase() || 'U'}
                        style={[styles.avatar, { backgroundColor: theme.colors.primary }]}
                    />
                )}
                <Text style={[styles.userName, { color: theme.colors.onSurface }]}>{otherUser?.full_name || 'User'}</Text>
                <Text style={[styles.userEmail, { color: theme.colors.onSurfaceVariant }]}>{otherUser?.email}</Text>
            </View>

            <ScrollView
                contentContainerStyle={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                <Card style={styles.card}>
                    <Card.Content style={styles.balanceContainer}>
                        <Text style={[styles.balanceLabel, { color: theme.colors.onSurfaceVariant }]}>
                            {pairwiseBalance > 0 ? "You are owed" : pairwiseBalance < 0 ? "You owe" : "Settled up"}
                        </Text>
                        <Text style={[
                            styles.balanceAmount,
                            pairwiseBalance > 0 ? styles.positive : pairwiseBalance < 0 ? styles.negative : styles.neutral
                        ]}>
                            {pairwiseBalance < 0 ? '₹-' : '₹'}{Math.abs(pairwiseBalance).toFixed(2)}
                        </Text>

                        <View style={styles.actionButtons}>
                            {/* {pairwiseBalance < -0.01 && (
                            // )} */}
                            <Button mode="contained" onPress={openSettleModal} style={styles.button}>
                                Settle Up
                            </Button>
                            <Button mode="contained" onPress={openReceiveModal} style={styles.button} buttonColor={theme.colors.primary}>
                                Mark Settled
                            </Button>
                            {/* {pairwiseBalance > 0.01 && (
                            )} */}
                            <Button
                                mode="outlined"
                                icon="download"
                                onPress={downloadReport}
                                style={styles.button}
                            >
                                Export CSV
                            </Button>
                        </View>
                    </Card.Content>
                </Card>

                <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Activity & Expenses</Text>
                </View>

                {allTransactions.length === 0 ? (
                    <Text style={{ textAlign: 'center', marginTop: 20, color: theme.colors.onSurfaceDisabled }}>
                        No shared activity yet.
                    </Text>
                ) : (
                    Object.entries(groupedTransactions)
                        .sort((a, b) => b[0].localeCompare(a[0])) // Sort weeks newest first
                        .map(([weekKey, weekData]) => (
                            <View key={weekKey} style={styles.weekSection}>
                                <Text style={[styles.weekHeader, { color: theme.colors.onSurfaceVariant }]}>
                                    {weekData.label}
                                </Text>

                                {Object.entries(weekData.days)
                                    .sort((a, b) => b[0].localeCompare(a[0])) // Sort days newest first
                                    .map(([dayKey, dayData]) => (
                                        <View key={dayKey} style={styles.daySection}>
                                            <Text style={[styles.dayHeader, { color: theme.colors.primary }]}>
                                                {dayData.label}
                                            </Text>

                                            {dayData.transactions.map((item: any) => {
                                                const isSettlement = item.type === 'settlement';

                                                if (isSettlement) {
                                                    const iPaid = item.from_user === profile?.id;
                                                    return (
                                                        <Card key={`settle_${item.id}`} style={[styles.expenseCard, { backgroundColor: theme.colors.surfaceVariant }]}>
                                                            <Card.Content style={styles.expenseContent}>
                                                                <View style={styles.expenseMain}>
                                                                    <Text style={[styles.expenseDesc, { color: theme.colors.onSurface }]}>
                                                                        {iPaid ? 'You paid' : `${otherUser.full_name} paid`}
                                                                    </Text>
                                                                    <Text style={[styles.expenseSubtext, { color: theme.colors.onSurfaceVariant }]}>
                                                                        Payment
                                                                    </Text>
                                                                </View>
                                                                <View>
                                                                    <Text style={[
                                                                        styles.expenseAmount,
                                                                        styles.neutral
                                                                    ]}>
                                                                        Settled ₹{item.amount}
                                                                    </Text>
                                                                </View>
                                                            </Card.Content>
                                                        </Card>
                                                    );
                                                }

                                                // Expense
                                                const expense = item;
                                                const iPaid = expense.paid_by === profile?.id;
                                                const split = expense.splits?.find((s: any) => s.user_id === (iPaid ? userId : profile?.id));
                                                const amount = split ? split.amount : 0;

                                                return (
                                                    <Card key={expense.id} style={styles.expenseCard} onPress={() => navigation.navigate('ExpenseDetails', { expenseId: expense.id })}>
                                                        <Card.Content style={styles.expenseContent}>
                                                            <View style={styles.expenseMain}>
                                                                <Text style={[styles.expenseDesc, { color: theme.colors.onSurface }]}>{expense.description}</Text>
                                                                <Text style={[styles.expenseSubtext, { color: theme.colors.onSurfaceVariant }]}>
                                                                    {iPaid ? 'You paid' : `${otherUser.full_name} paid`}
                                                                </Text>
                                                            </View>
                                                            <View>
                                                                <Text style={[
                                                                    styles.expenseAmount,
                                                                    iPaid ? styles.positive : styles.negative
                                                                ]}>
                                                                    {iPaid ? 'lens' : 'borrows'} ₹{amount}
                                                                </Text>
                                                            </View>
                                                        </Card.Content>
                                                    </Card>
                                                );
                                            })}
                                        </View>
                                    ))}
                            </View>
                        ))
                )}
            </ScrollView>

            <Portal>
                <Modal visible={settleModalVisible} onDismiss={() => setSettleModalVisible(false)} contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}>
                    <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>Settle Up</Text>
                    <Text style={{ marginBottom: 16, color: theme.colors.onSurfaceVariant }}>
                        Recording payment to {otherUser.full_name}
                    </Text>

                    <TextInput
                        label="Amount"
                        value={settleAmount}
                        onChangeText={setSettleAmount}
                        keyboardType="numeric"
                        mode="outlined"
                        style={{ marginBottom: 12 }}
                        left={<TextInput.Affix text="₹" />}
                    />
                    <TextInput
                        label="Notes (Optional)"
                        value={settleNotes}
                        onChangeText={setSettleNotes}
                        mode="outlined"
                        style={{ marginBottom: 20 }}
                    />

                    <View style={styles.modalActions}>
                        <Button onPress={() => setSettleModalVisible(false)} disabled={isProcessing}>Cancel</Button>
                        <Button mode="contained" onPress={handleSettleUp} loading={isProcessing} disabled={!isProcessing}>
                            PAY ₹{settleAmount || '0'}
                        </Button>
                    </View>
                </Modal>
            </Portal>

            <Portal>
                <Modal visible={receiveModalVisible} onDismiss={() => setReceiveModalVisible(false)} contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}>
                    <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>Mark as Settled</Text>
                    <Text style={{ marginBottom: 16, color: theme.colors.onSurfaceVariant }}>
                        {otherUser.full_name} is paying you
                    </Text>

                    <TextInput
                        label="Amount"
                        value={settleAmount}
                        onChangeText={setSettleAmount}
                        keyboardType="numeric"
                        mode="outlined"
                        style={{ marginBottom: 12 }}
                        left={<TextInput.Affix text="₹" />}
                    />
                    <TextInput
                        label="Notes"
                        value={settleNotes}
                        onChangeText={setSettleNotes}
                        mode="outlined"
                        placeholder="e.g. Paid in cash"
                        style={{ marginBottom: 20 }}
                    />

                    <View style={styles.modalActions}>
                        <Button onPress={() => setReceiveModalVisible(false)} disabled={isProcessing}>Cancel</Button>
                        <Button mode="contained" onPress={handleReceiveSettlement} loading={isProcessing} disabled={isProcessing}>
                            CONFIRM
                        </Button>
                    </View>
                </Modal>
            </Portal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: { padding: 16 },
    profileHeader: { alignItems: 'center', marginVertical: 20 },
    avatar: { marginBottom: 12 },
    userName: { fontSize: 24, fontWeight: 'bold' },
    userEmail: { fontSize: 14 },
    card: { marginBottom: 24, elevation: 2 },
    balanceContainer: { alignItems: 'center', padding: 16 },
    balanceLabel: { fontSize: 16, marginBottom: 8 },
    balanceAmount: { fontSize: 32, fontWeight: 'bold', marginBottom: 24 },
    actionButtons: { flexDirection: 'row', gap: 12 },
    button: { flex: 1 },
    positive: { color: '#4CAF50' },
    negative: { color: '#F44336' },
    neutral: { color: '#666' },
    sectionHeader: { marginBottom: 12 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold' },
    weekSection: { marginBottom: 24 },
    weekHeader: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.5
    },
    daySection: { marginBottom: 16 },
    dayHeader: {
        fontSize: 13,
        fontWeight: '700',
        marginBottom: 8,
        marginTop: 4,
        textTransform: 'capitalize'
    },
    expenseCard: { marginBottom: 8 },
    expenseContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    expenseMain: { flex: 1 },
    expenseDesc: { fontSize: 16, fontWeight: '500' },
    expenseDate: { fontSize: 12 },
    expenseSubtext: { fontSize: 12, marginTop: 2 },
    expenseAmount: { fontSize: 16, fontWeight: 'bold' },
    modal: { padding: 24, margin: 20, borderRadius: 8 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }
});
