import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Image, Alert, Dimensions, StatusBar, RefreshControl } from 'react-native';
import { Text, Card, Avatar, Button, IconButton, Chip, Divider, List, Portal, Modal, FAB } from 'react-native-paper';
import { useExpenses } from '../../hooks/useExpenses';
import { useGroups } from '../../hooks/useGroups';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useNetworkCheck } from '../../hooks/useNetworkCheck';
import { useAppDispatch } from '../../store';
import { fetchExpense, deleteExpense } from '../../store/slices/expensesSlice';
import { fetchGroup } from '../../store/slices/groupsSlice';
import { ErrorHandler } from '../../utils/errorHandler';
import LoadingOverlay from '../../components/LoadingOverlay';
import { format } from 'date-fns';
import { useTheme } from 'react-native-paper';

const { width } = Dimensions.get('window');

interface Props {
    navigation: any;
    route: {
        params: {
            expenseId: string;
            groupId?: string;
        };
    };
}

export default function SingleGroupExpenseDetailsScreen({ navigation, route }: Props) {
    const { expenseId, groupId } = route.params;
    const theme = useTheme();
    const { selectedExpense, loading } = useExpenses();
    const { selectedGroup } = useGroups();
    const { profile } = useAuth();
    const { showToast } = useToast();
    const { isOnline } = useNetworkCheck();
    const dispatch = useAppDispatch();

    const [isProcessing, setIsProcessing] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [receiptModalVisible, setReceiptModalVisible] = useState(false);

    useEffect(() => {
        loadData();
    }, [expenseId, groupId]);

    const loadData = async () => {
        if (!isOnline) {
            showToast('Unable to load data. No internet connection.', 'error');
            return;
        }

        try {
            await dispatch(fetchExpense(expenseId)).unwrap();
            if (groupId) {
                await dispatch(fetchGroup(groupId)).unwrap();
            }
        } catch (error) {
            ErrorHandler.handleError(error, showToast, 'Load Expense Details');
            navigation.goBack();
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const handleDeleteExpense = () => {
        Alert.alert(
            'Delete Expense',
            'Are you sure you want to delete this expense? This action cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        if (!isOnline) {
                            showToast('Cannot delete expense. No internet connection.', 'error');
                            return;
                        }

                        setIsProcessing(true);
                        try {
                            await dispatch(deleteExpense(expenseId)).unwrap();
                            showToast('Expense deleted successfully', 'success');
                            navigation.goBack();
                        } catch (error) {
                            ErrorHandler.handleError(error, showToast, 'Delete Expense');
                        } finally {
                            setIsProcessing(false);
                        }
                    },
                },
            ]
        );
    };

    const handleEditExpense = () => {
        if (!isOnline) {
            showToast('Cannot edit expense. No internet connection.', 'error');
            return;
        }

        navigation.navigate('EditExpense', { expenseId });
    };

    const handleMarkAsSettled = async (splitId: string) => {
        if (!isOnline) {
            showToast('Cannot update expense. No internet connection.', 'error');
            return;
        }

        Alert.alert(
            'Mark as Settled',
            'Mark this split as settled?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Mark Settled',
                    onPress: async () => {
                        setIsProcessing(true);
                        try {
                            // TODO: Implement mark split as settled
                            showToast('Split marked as settled', 'success');
                            await loadData();
                        } catch (error) {
                            ErrorHandler.handleError(error, showToast, 'Mark as Settled');
                        } finally {
                            setIsProcessing(false);
                        }
                    },
                },
            ]
        );
    };

    const navigateToGroup = () => {
        if (selectedExpense?.group_id) {
            navigation.navigate('GroupDetails', { groupId: selectedExpense.group_id });
        }
    };

    if (!selectedExpense) {
        return (
            <View style={styles.loadingContainer}>
                <LoadingOverlay visible={true} message="Loading expense..." />
            </View>
        );
    }

    const isPaidByMe = selectedExpense.paid_by === profile?.id;
    const mySplit = selectedExpense.splits?.find(s => s.user_id === profile?.id);
    const myShare = mySplit ? Number(mySplit.amount) : 0;
    const totalAmount = Number(selectedExpense.amount);
    const allSettled = selectedExpense.splits?.every(s => s.is_settled) || false;
    const groupName = selectedGroup?.name || 'Group';

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <StatusBar barStyle="light-content" backgroundColor="#6200EE" translucent={false} />
            <ScrollView
                contentContainerStyle={styles.content}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
            >
                {/* Group Context Card */}
                {selectedExpense.group_id && (
                    <Card style={styles.groupCard} onPress={navigateToGroup}>
                        <Card.Content style={styles.groupContent}>
                            <Avatar.Text
                                size={40}
                                label={groupName.substring(0, 2).toUpperCase()}
                                style={[styles.groupAvatar, { backgroundColor: theme.colors.primary }]}
                            />
                            <View style={styles.groupInfo}>
                                <Text style={[styles.groupLabel, { color: theme.colors.onSurfaceVariant }]}>
                                    Expense in group
                                </Text>
                                <Text style={[styles.groupName, { color: theme.colors.onSurface }]}>
                                    {groupName}
                                </Text>
                            </View>
                            <IconButton icon="chevron-right" size={24} />
                        </Card.Content>
                    </Card>
                )}

                {/* Expense Header */}
                <Card style={styles.headerCard}>
                    <Card.Content>
                        <View style={styles.header}>
                            <Text style={styles.categoryIcon}>
                                {selectedExpense.category?.icon || '💰'}
                            </Text>
                            <View style={styles.headerText}>
                                <Text style={[styles.description, { color: theme.colors.onSurface }]}>
                                    {selectedExpense.description}
                                </Text>
                                <Chip
                                    mode="flat"
                                    style={[styles.categoryChip, { backgroundColor: theme.colors.primaryContainer }]}
                                    textStyle={[styles.categoryChipText, { color: theme.colors.onPrimaryContainer }]}
                                >
                                    {selectedExpense.category?.name || 'Other'}
                                </Chip>
                            </View>
                        </View>

                        <Divider style={styles.divider} />

                        <View style={styles.amountSection}>
                            <View style={styles.amountRow}>
                                <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
                                    Total Amount
                                </Text>
                                <Text style={[styles.totalAmount, { color: theme.colors.onSurface }]}>
                                    ₹{totalAmount.toFixed(2)}
                                </Text>
                            </View>
                            <View style={styles.amountRow}>
                                <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
                                    Your Share
                                </Text>
                                <Text
                                    style={[
                                        styles.yourShare,
                                        isPaidByMe ? styles.positiveAmount : styles.negativeAmount,
                                    ]}
                                >
                                    {isPaidByMe ? '+' : '-'}₹{myShare.toFixed(2)}
                                </Text>
                            </View>
                        </View>

                        {allSettled && (
                            <Chip
                                icon="check-circle"
                                style={[styles.settledChip, { backgroundColor: theme.colors.tertiaryContainer }]}
                                textStyle={[styles.settledText, { color: theme.colors.onTertiaryContainer }]}
                            >
                                All Settled
                            </Chip>
                        )}
                    </Card.Content>
                </Card>

                {/* Expense Details */}
                <Card style={styles.detailsCard}>
                    <Card.Content>
                        <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                            Details
                        </Text>

                        <List.Item
                            title="Paid By"
                            description={
                                isPaidByMe
                                    ? 'You'
                                    : selectedExpense.paid_by_user?.full_name || 'Unknown'
                            }
                            left={(props) => <List.Icon {...props} icon="account" />}
                            titleStyle={{ color: theme.colors.onSurface }}
                            descriptionStyle={{ color: theme.colors.onSurfaceVariant }}
                        />
                        <Divider />

                        <List.Item
                            title="Date"
                            description={format(new Date(selectedExpense.date), 'EEEE, MMMM dd, yyyy')}
                            left={(props) => <List.Icon {...props} icon="calendar" />}
                            titleStyle={{ color: theme.colors.onSurface }}
                            descriptionStyle={{ color: theme.colors.onSurfaceVariant }}
                        />
                        <Divider />

                        <List.Item
                            title="Split Type"
                            description={
                                selectedExpense.split_type === 'equal'
                                    ? 'Split Equally'
                                    : selectedExpense.split_type === 'percentage'
                                        ? 'Split by Percentage'
                                        : 'Custom Split'
                            }
                            left={(props) => <List.Icon {...props} icon="chart-pie" />}
                            titleStyle={{ color: theme.colors.onSurface }}
                            descriptionStyle={{ color: theme.colors.onSurfaceVariant }}
                        />

                        {selectedExpense.notes && (
                            <>
                                <Divider />
                                <List.Item
                                    title="Notes"
                                    description={selectedExpense.notes}
                                    left={(props) => <List.Icon {...props} icon="note-text" />}
                                    titleStyle={{ color: theme.colors.onSurface }}
                                    descriptionStyle={{ color: theme.colors.onSurfaceVariant }}
                                />
                            </>
                        )}

                        {selectedExpense.receipt_url && (
                            <>
                                <Divider />
                                <List.Item
                                    title="Receipt"
                                    description="Tap to view"
                                    left={(props) => <List.Icon {...props} icon="receipt" />}
                                    right={(props) => <List.Icon {...props} icon="chevron-right" />}
                                    onPress={() => setReceiptModalVisible(true)}
                                    titleStyle={{ color: theme.colors.onSurface }}
                                    descriptionStyle={{ color: theme.colors.onSurfaceVariant }}
                                />
                            </>
                        )}
                    </Card.Content>
                </Card>

                {/* Split Details */}
                <Card style={styles.splitsCard}>
                    <Card.Content>
                        <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                            Split Between ({selectedExpense.splits?.length || 0} {selectedExpense.splits?.length === 1 ? 'person' : 'people'})
                        </Text>

                        {selectedExpense.splits?.map((split, index) => {
                            const user = split.user;
                            const isCurrentUser = split.user_id === profile?.id;
                            const splitAmount = Number(split.amount);
                            const splitPercentage = ((splitAmount / totalAmount) * 100).toFixed(0);

                            return (
                                <React.Fragment key={split.id}>
                                    {index > 0 && <Divider />}
                                    <View style={styles.splitItem}>
                                        <View style={styles.splitLeft}>
                                            <Avatar.Text
                                                size={40}
                                                label={user?.full_name?.substring(0, 2).toUpperCase() || 'U'}
                                                style={[styles.splitAvatar, { backgroundColor: theme.colors.primary }]}
                                            />
                                            <View style={styles.splitInfo}>
                                                <Text style={[styles.splitName, { color: theme.colors.onSurface }]}>
                                                    {user?.full_name || 'Unknown'}
                                                    {isCurrentUser && ' (You)'}
                                                </Text>
                                                <Text style={[styles.splitPercentage, { color: theme.colors.onSurfaceVariant }]}>
                                                    {splitPercentage}% of total
                                                </Text>
                                                {user?.email && (
                                                    <Text style={[styles.splitEmail, { color: theme.colors.onSurfaceVariant }]}>
                                                        {user.email}
                                                    </Text>
                                                )}
                                            </View>
                                        </View>

                                        <View style={styles.splitRight}>
                                            <Text style={[styles.splitAmount, { color: theme.colors.onSurface }]}>
                                                ₹{splitAmount.toFixed(2)}
                                            </Text>
                                            {split.is_settled ? (
                                                <Chip
                                                    icon="check"
                                                    style={[styles.settledBadge, { backgroundColor: theme.colors.tertiaryContainer }]}
                                                    textStyle={[styles.settledBadgeText, { color: theme.colors.onTertiaryContainer }]}
                                                    compact
                                                >
                                                    Settled
                                                </Chip>
                                            ) : isPaidByMe && !isCurrentUser ? (
                                                <Button
                                                    mode="text"
                                                    onPress={() => handleMarkAsSettled(split.id)}
                                                    compact
                                                >
                                                    Mark Settled
                                                </Button>
                                            ) : (
                                                <Chip
                                                    style={[styles.pendingBadge, { backgroundColor: theme.colors.errorContainer }]}
                                                    textStyle={[styles.pendingBadgeText, { color: theme.colors.onErrorContainer }]}
                                                    compact
                                                >
                                                    Pending
                                                </Chip>
                                            )}
                                        </View>
                                    </View>
                                </React.Fragment>
                            );
                        })}
                    </Card.Content>
                </Card>

                {/* Payment Summary */}
                <Card style={styles.summaryCard}>
                    <Card.Content>
                        <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                            Payment Summary
                        </Text>

                        <View style={styles.summaryRow}>
                            <Text style={[styles.summaryLabel, { color: theme.colors.onSurfaceVariant }]}>
                                Total Expense
                            </Text>
                            <Text style={[styles.summaryValue, { color: theme.colors.onSurface }]}>
                                ₹{totalAmount.toFixed(2)}
                            </Text>
                        </View>

                        <View style={styles.summaryRow}>
                            <Text style={[styles.summaryLabel, { color: theme.colors.onSurfaceVariant }]}>
                                You {isPaidByMe ? 'Paid' : 'Owe'}
                            </Text>
                            <Text style={[styles.summaryValue, { color: theme.colors.onSurface }]}>
                                ₹{myShare.toFixed(2)}
                            </Text>
                        </View>

                        {isPaidByMe && (
                            <View style={styles.summaryRow}>
                                <Text style={[styles.summaryLabel, { color: theme.colors.onSurfaceVariant }]}>
                                    You Are Owed
                                </Text>
                                <Text style={[styles.summaryValue, styles.positiveAmount]}>
                                    ₹{(totalAmount - myShare).toFixed(2)}
                                </Text>
                            </View>
                        )}

                        <Divider style={styles.divider} />

                        <View style={styles.summaryRow}>
                            <Text style={[styles.summaryLabel, { color: theme.colors.onSurfaceVariant }]}>
                                Status
                            </Text>
                            <Chip
                                icon={allSettled ? 'check-circle' : 'clock-outline'}
                                style={[
                                    styles.statusChip,
                                    allSettled
                                        ? { backgroundColor: theme.colors.tertiaryContainer }
                                        : { backgroundColor: theme.colors.secondaryContainer }
                                ]}
                                textStyle={{
                                    color: allSettled ? theme.colors.onTertiaryContainer : theme.colors.onSecondaryContainer
                                }}
                                compact
                            >
                                {allSettled ? 'Fully Settled' : 'Partially Settled'}
                            </Chip>
                        </View>
                    </Card.Content>
                </Card>

                {/* Action Buttons */}
                {isPaidByMe && (
                    <View style={styles.actions}>
                        <Button
                            mode="outlined"
                            icon="pencil"
                            onPress={handleEditExpense}
                            style={styles.actionButton}
                        >
                            Edit
                        </Button>
                        <Button
                            mode="outlined"
                            icon="delete"
                            onPress={handleDeleteExpense}
                            style={[styles.deleteButton, { borderColor: theme.colors.error }]}
                            textColor={theme.colors.error}
                        >
                            Delete
                        </Button>
                    </View>
                )}

                {/* Created Info */}
                <Text style={[styles.createdText, { color: theme.colors.onSurfaceVariant }]}>
                    Created on {format(new Date(selectedExpense.created_at), 'MMM dd, yyyy HH:mm')}
                </Text>
            </ScrollView>

            {/* Receipt Modal */}
            <Portal>
                <Modal
                    visible={receiptModalVisible}
                    onDismiss={() => setReceiptModalVisible(false)}
                    contentContainerStyle={[styles.receiptModal, { backgroundColor: theme.colors.surface }]}
                >
                    <View style={styles.receiptHeader}>
                        <Text style={[styles.receiptTitle, { color: theme.colors.onSurface }]}>
                            Receipt
                        </Text>
                        <IconButton
                            icon="close"
                            size={24}
                            onPress={() => setReceiptModalVisible(false)}
                        />
                    </View>
                    {selectedExpense.receipt_url && (
                        <Image
                            source={{ uri: selectedExpense.receipt_url }}
                            style={styles.receiptImage}
                            resizeMode="contain"
                        />
                    )}
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
        paddingBottom: 120,
    },
    groupCard: {
        marginBottom: 16,
        elevation: 2,
    },
    groupContent: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
    },
    groupAvatar: {
        backgroundColor: '#6200EE',
    },
    groupInfo: {
        flex: 1,
        marginLeft: 12,
    },
    groupLabel: {
        fontSize: 12,
    },
    groupName: {
        fontSize: 16,
        fontWeight: '600',
        marginTop: 2,
    },
    headerCard: {
        marginBottom: 16,
        elevation: 2,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    categoryIcon: {
        fontSize: 48,
        marginRight: 16,
    },
    headerText: {
        flex: 1,
    },
    description: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    categoryChip: {
        alignSelf: 'flex-start',
    },
    categoryChipText: {
        fontSize: 12,
    },
    divider: {
        marginVertical: 16,
    },
    amountSection: {
        gap: 12,
    },
    amountRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    label: {
        fontSize: 14,
    },
    totalAmount: {
        fontSize: 28,
        fontWeight: 'bold',
    },
    yourShare: {
        fontSize: 24,
        fontWeight: 'bold',
    },
    positiveAmount: {
        color: '#4CAF50',
    },
    negativeAmount: {
        color: '#F44336',
    },
    settledChip: {
        alignSelf: 'flex-start',
        marginTop: 16,
    },
    settledText: {
        fontWeight: '600',
    },
    detailsCard: {
        marginBottom: 16,
        elevation: 2,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 16,
    },
    splitsCard: {
        marginBottom: 16,
        elevation: 2,
    },
    splitItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
    },
    splitLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    splitAvatar: {
        backgroundColor: '#6200EE',
    },
    splitInfo: {
        marginLeft: 12,
        flex: 1,
    },
    splitName: {
        fontSize: 16,
        fontWeight: '600',
    },
    splitPercentage: {
        fontSize: 12,
        marginTop: 2,
    },
    splitEmail: {
        fontSize: 11,
        marginTop: 2,
    },
    splitRight: {
        alignItems: 'flex-end',
    },
    splitAmount: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    settledBadge: {
        height: 24,
    },
    settledBadgeText: {
        fontSize: 11,
    },
    pendingBadge: {
        height: 24,
    },
    pendingBadgeText: {
        fontSize: 11,
    },
    summaryCard: {
        marginBottom: 16,
        elevation: 2,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
    },
    summaryLabel: {
        fontSize: 14,
    },
    summaryValue: {
        fontSize: 16,
        fontWeight: '600',
    },
    statusChip: {
        height: 28,
    },
    actions: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    actionButton: {
        flex: 1,
    },
    deleteButton: {
        flex: 1,
    },
    createdText: {
        fontSize: 12,
        textAlign: 'center',
        marginTop: 8,
    },
    receiptModal: {
        margin: 20,
        borderRadius: 8,
        maxHeight: '80%',
    },
    receiptHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    receiptTitle: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    receiptImage: {
        width: width - 40,
        height: 400,
        alignSelf: 'center',
    },
});
