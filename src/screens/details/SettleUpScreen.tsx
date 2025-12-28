// src/screens/details/SettleUpScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, StatusBar } from 'react-native';
import { Text, Card, Avatar, Button, TextInput, HelperText, RadioButton, Divider, Chip, useTheme } from 'react-native-paper';
import { useGroups } from '../../hooks/useGroups';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useNetworkCheck } from '../../hooks/useNetworkCheck';
import { useAppDispatch } from '../../store';
import { fetchGroups, fetchGroupBalances } from '../../store/slices/groupsSlice';
import { settleUp } from '../../store/slices/expensesSlice';
import { ErrorHandler } from '../../utils/errorHandler';
import LoadingOverlay from '../../components/LoadingOverlay';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
    navigation: any;
    route?: {
        params?: {
            groupId?: string;
            userId?: string;
            suggestedAmount?: number;
        };
    };
}

export default function SettleUpScreen({ navigation, route }: Props) {
    const theme = useTheme();
    const { groups, balances } = useGroups();
    const { profile } = useAuth();
    const { showToast } = useToast();
    const { isOnline } = useNetworkCheck();
    const dispatch = useAppDispatch();
    const insets = useSafeAreaInsets();

    const preSelectedGroupId = route?.params?.groupId;
    const preSelectedUserId = route?.params?.userId;
    const suggestedAmount = route?.params?.suggestedAmount;

    const [selectedGroupId, setSelectedGroupId] = useState(preSelectedGroupId || '');
    const [selectedUserId, setSelectedUserId] = useState(preSelectedUserId || '');
    const [amount, setAmount] = useState(suggestedAmount ? suggestedAmount.toString() : '');
    const [notes, setNotes] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [errors, setErrors] = useState({
        group: '',
        user: '',
        amount: '',
    });

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (selectedGroupId) {
            dispatch(fetchGroupBalances(selectedGroupId));
        }
    }, [selectedGroupId]);

    const loadData = async () => {
        if (!isOnline) {
            showToast('Unable to load data. No internet connection.', 'error');
            return;
        }

        try {
            await dispatch(fetchGroups()).unwrap();
        } catch (error) {
            ErrorHandler.handleError(error, showToast, 'Load Groups');
        }
    };

    const validateForm = () => {
        const newErrors = {
            group: '',
            user: '',
            amount: '',
        };

        let isValid = true;

        if (!selectedGroupId) {
            newErrors.group = 'Please select a group';
            isValid = false;
        }

        if (!selectedUserId) {
            newErrors.user = 'Please select who you are paying';
            isValid = false;
        }

        const amountNum = parseFloat(amount);
        if (!amount || isNaN(amountNum) || amountNum <= 0) {
            newErrors.amount = 'Please enter a valid amount greater than 0';
            isValid = false;
        }

        setErrors(newErrors);
        return isValid;
    };

    const handleSettleUp = async () => {
        if (!validateForm()) return;

        if (!isOnline) {
            showToast('Cannot settle up. No internet connection.', 'error');
            return;
        }

        const amountNum = parseFloat(amount);
        const selectedUser = getUsersToSettle().find((u: any) => u.id === selectedUserId);

        Alert.alert(
            'Confirm Settlement',
            `Pay ₹${amountNum.toFixed(2)} to ${selectedUser?.name || 'user'}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Confirm',
                    onPress: async () => {
                        setIsProcessing(true);
                        try {
                            await dispatch(settleUp({
                                group_id: selectedGroupId,
                                from_user: profile!.id,
                                to_user: selectedUserId,
                                amount: amountNum,
                                notes: notes.trim() || undefined,
                            })).unwrap();

                            showToast('Payment recorded successfully!', 'success');
                            navigation.goBack();
                        } catch (error) {
                            ErrorHandler.handleError(error, showToast, 'Settle Up');
                        } finally {
                            setIsProcessing(false);
                        }
                    },
                },
            ]
        );
    };

    const getUsersToSettle = () => {
        if (!selectedGroupId) return [];

        const selectedGroup = groups.find((g: any) => g.id === selectedGroupId);
        if (!selectedGroup?.members) return [];

        // Get balances for this group
        const groupBalances = balances.filter((b: any) => b.group_id === selectedGroupId);

        // Get users I owe money to (negative balance)
        return selectedGroup.members
            .filter((m: any) => m.user_id !== profile?.id)
            .map((m: any) => {
                const balance = groupBalances.find((b: any) => b.user_id === m.user_id);
                const myBalance = groupBalances.find((b: any) => b.user_id === profile?.id);

                // Calculate how much I owe this user
                let oweAmount = 0;
                if (myBalance && myBalance.balance < 0) {
                    // I owe money overall
                    if (balance && balance.balance > 0) {
                        // This user is owed money
                        oweAmount = Math.min(Math.abs(myBalance.balance), balance.balance);
                    }
                }

                return {
                    id: m.user_id,
                    name: m.user?.full_name || 'Unknown',
                    email: m.user?.email || '',
                    balance: balance?.balance || 0,
                    oweAmount,
                };
            })
            .filter((u: any) => u.oweAmount > 0)
            .sort((a: any, b: any) => b.oweAmount - a.oweAmount);
    };

    const getSelectedUserBalance = () => {
        const user = getUsersToSettle().find((u: any) => u.id === selectedUserId);
        return user?.oweAmount || 0;
    };

    const selectedGroup = groups.find((g: any) => g.id === selectedGroupId);
    const usersToSettle = getUsersToSettle();
    const selectedUserBalance = getSelectedUserBalance();

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <StatusBar barStyle="light-content" backgroundColor="#6200EE" translucent={false} />
            <KeyboardAvoidingView
                style={styles.keyboardView}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScrollView contentContainerStyle={styles.content}>
                    {/* Info Card */}
                    <Card style={[styles.infoCard, { backgroundColor: theme.colors.surface }]}>
                        <Card.Content>
                            <View style={styles.infoHeader}>
                                <Text style={styles.infoIcon}>💸</Text>
                                <View style={styles.infoText}>
                                    <Text style={[styles.infoTitle, { color: theme.colors.primary }]}>Settle Up</Text>
                                    <Text style={[styles.infoDescription, { color: theme.colors.onSurfaceVariant }]}>
                                        Record a payment you made to a group member
                                    </Text>
                                </View>
                            </View>
                        </Card.Content>
                    </Card>

                    {/* Group Selection */}
                    <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Which group?</Text>
                    {groups.length === 0 ? (
                        <Card style={[styles.emptyCard, { backgroundColor: theme.colors.surface }]}>
                            <Card.Content>
                                <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>No groups available</Text>
                                <Button
                                    mode="contained"
                                    onPress={() => navigation.navigate('Groups')}
                                    style={styles.emptyButton}
                                >
                                    Create a Group
                                </Button>
                            </Card.Content>
                        </Card>
                    ) : (
                        <Card style={[styles.selectionCard, { backgroundColor: theme.colors.surface }]}>
                            <RadioButton.Group
                                onValueChange={(value) => {
                                    setSelectedGroupId(value);
                                    setSelectedUserId(''); // Reset user selection
                                }}
                                value={selectedGroupId}
                            >
                                {groups.map((group: any) => (
                                    <React.Fragment key={group.id}>
                                        <RadioButton.Item
                                            label={group.name}
                                            value={group.id}
                                            position="leading"
                                        />
                                        <Divider />
                                    </React.Fragment>
                                ))}
                            </RadioButton.Group>
                        </Card>
                    )}
                    {errors.group ? (
                        <HelperText type="error" visible={!!errors.group}>
                            {errors.group}
                        </HelperText>
                    ) : null}

                    {/* User Selection */}
                    {selectedGroupId && (
                        <>
                            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Pay whom?</Text>
                            {usersToSettle.length === 0 ? (
                                <Card style={[styles.emptyCard, { backgroundColor: theme.colors.surface }]}>
                                    <Card.Content>
                                        <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
                                            You don't owe anyone in this group
                                        </Text>
                                        <Text style={[styles.emptySubtext, { color: theme.colors.onSurfaceVariant }]}>
                                            You're all settled up! 🎉
                                        </Text>
                                    </Card.Content>
                                </Card>
                            ) : (
                                <Card style={[styles.selectionCard, { backgroundColor: theme.colors.surface }]}>
                                    <RadioButton.Group
                                        onValueChange={(value) => {
                                            setSelectedUserId(value);
                                            // Auto-fill suggested amount
                                            const user = usersToSettle.find((u: any) => u.id === value);
                                            if (user) {
                                                setAmount(user.oweAmount.toFixed(2));
                                            }
                                        }}
                                        value={selectedUserId}
                                    >
                                        {usersToSettle.map((user: any, index: number) => (
                                            <React.Fragment key={user.id}>
                                                {index > 0 && <Divider />}
                                                <View style={styles.userItem}>
                                                    <RadioButton.Item
                                                        label=""
                                                        value={user.id}
                                                        position="leading"
                                                        style={styles.radioButton}
                                                    />
                                                    <View style={styles.userInfo}>
                                                        <Avatar.Text
                                                            size={40}
                                                            label={user.name.substring(0, 2).toUpperCase()}
                                                            style={[styles.userAvatar, { backgroundColor: theme.colors.primary }]}
                                                        />
                                                        <View style={styles.userDetails}>
                                                            <Text style={[styles.userName, { color: theme.colors.onSurface }]}>{user.name}</Text>
                                                            <Text style={[styles.userEmail, { color: theme.colors.onSurfaceVariant }]}>{user.email}</Text>
                                                        </View>
                                                        <View style={styles.userBalance}>
                                                            <Text style={[styles.balanceLabel, { color: theme.colors.onSurfaceVariant }]}>You owe</Text>
                                                            <Text style={[styles.balanceAmount, { color: theme.colors.error }]}>
                                                                ₹{user.oweAmount.toFixed(2)}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                </View>
                                            </React.Fragment>
                                        ))}
                                    </RadioButton.Group>
                                </Card>
                            )}
                            {errors.user ? (
                                <HelperText type="error" visible={!!errors.user}>
                                    {errors.user}
                                </HelperText>
                            ) : null}
                        </>
                    )}

                    {/* Amount Input */}
                    {selectedUserId && (
                        <>
                            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>How much?</Text>
                            <TextInput
                                label="Amount *"
                                value={amount}
                                onChangeText={setAmount}
                                mode="outlined"
                                keyboardType="decimal-pad"
                                placeholder="0.00"
                                error={!!errors.amount}
                                left={<TextInput.Affix text="₹" />}
                                style={styles.input}
                            />
                            {errors.amount ? (
                                <HelperText type="error" visible={!!errors.amount}>
                                    {errors.amount}
                                </HelperText>
                            ) : null}

                            {selectedUserBalance > 0 && (
                                <View style={[styles.suggestionContainer, { backgroundColor: theme.colors.primaryContainer }]}>
                                    <Text style={[styles.suggestionText, { color: theme.colors.onPrimaryContainer }]}>
                                        Suggested amount: ₹{selectedUserBalance.toFixed(2)}
                                    </Text>
                                    <Button
                                        mode="text"
                                        onPress={() => setAmount(selectedUserBalance.toFixed(2))}
                                        compact
                                    >
                                        Use
                                    </Button>
                                </View>
                            )}

                            {/* Quick Amount Buttons */}
                            <View style={styles.quickAmounts}>
                                {[100, 500, 1000, 2000].map((quickAmount) => (
                                    <Chip
                                        key={quickAmount}
                                        selected={parseFloat(amount) === quickAmount}
                                        onPress={() => setAmount(quickAmount.toString())}
                                        style={styles.quickAmountChip}
                                    >
                                        ₹{quickAmount}
                                    </Chip>
                                ))}
                            </View>
                        </>
                    )}

                    {/* Notes */}
                    {selectedUserId && (
                        <>
                            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Notes (Optional)</Text>
                            <TextInput
                                label="Add a note"
                                value={notes}
                                onChangeText={setNotes}
                                mode="outlined"
                                multiline
                                numberOfLines={3}
                                placeholder="e.g., Cash payment, Bank transfer..."
                                style={styles.input}
                            />
                        </>
                    )}

                    {/* Summary */}
                    {selectedUserId && amount && parseFloat(amount) > 0 && (
                        <Card style={[styles.summaryCard, { backgroundColor: theme.colors.surfaceVariant }]}>
                            <Card.Content>
                                <Text style={[styles.summaryTitle, { color: theme.colors.onSurfaceVariant }]}>Payment Summary</Text>
                                <Divider style={styles.summaryDivider} />

                                <View style={styles.summaryRow}>
                                    <Text style={[styles.summaryLabel, { color: theme.colors.onSurfaceVariant }]}>From</Text>
                                    <Text style={[styles.summaryValue, { color: theme.colors.onSurface }]}>You</Text>
                                </View>

                                <View style={styles.summaryRow}>
                                    <Text style={[styles.summaryLabel, { color: theme.colors.onSurfaceVariant }]}>To</Text>
                                    <Text style={[styles.summaryValue, { color: theme.colors.onSurface }]}>
                                        {usersToSettle.find((u: any) => u.id === selectedUserId)?.name}
                                    </Text>
                                </View>

                                <View style={styles.summaryRow}>
                                    <Text style={[styles.summaryLabel, { color: theme.colors.onSurfaceVariant }]}>Amount</Text>
                                    <Text style={[styles.summaryAmount, { color: theme.colors.primary }]}>₹{parseFloat(amount).toFixed(2)}</Text>
                                </View>

                                <View style={styles.summaryRow}>
                                    <Text style={[styles.summaryLabel, { color: theme.colors.onSurfaceVariant }]}>Group</Text>
                                    <Text style={[styles.summaryValue, { color: theme.colors.onSurface }]}>{selectedGroup?.name}</Text>
                                </View>
                            </Card.Content>
                        </Card>
                    )}

                    {/* Submit Button */}
                    {selectedUserId && (
                        <Button
                            mode="contained"
                            onPress={handleSettleUp}
                            loading={isProcessing}
                            disabled={isProcessing}
                            style={styles.submitButton}
                            contentStyle={styles.submitButtonContent}
                            icon="check"
                        >
                            Record Payment
                        </Button>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>

            <LoadingOverlay visible={isProcessing} message="Recording payment..." />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    keyboardView: {
        flex: 1,
    },
    content: {
        padding: 16,
        paddingBottom: 120,
    },
    infoCard: {
        marginBottom: 24,
        elevation: 2,
    },
    infoHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    infoIcon: {
        fontSize: 48,
        marginRight: 16,
    },
    infoText: {
        flex: 1,
    },
    infoTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    infoDescription: {
        fontSize: 14,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        marginTop: 16,
        marginBottom: 12,
    },
    selectionCard: {
        elevation: 2,
        marginBottom: 8,
    },
    emptyCard: {
        elevation: 2,
        marginBottom: 8,
    },
    emptyText: {
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 16,
    },
    emptyButton: {
        alignSelf: 'center',
    },
    userItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingRight: 16,
    },
    radioButton: {
        paddingVertical: 0,
    },
    userInfo: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    userAvatar: {
        marginRight: 12,
    },
    userDetails: {
        flex: 1,
    },
    userName: {
        fontSize: 16,
        fontWeight: '600',
    },
    userEmail: {
        fontSize: 12,
        marginTop: 2,
    },
    userBalance: {
        alignItems: 'flex-end',
    },
    balanceLabel: {
        fontSize: 11,
        marginBottom: 2,
    },
    balanceAmount: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    input: {
        marginBottom: 8,
    },
    suggestionContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
        borderRadius: 8,
        marginBottom: 12,
    },
    suggestionText: {
        fontSize: 14,
        fontWeight: '500',
    },
    quickAmounts: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 16,
    },
    quickAmountChip: {
        flex: 1,
        minWidth: 70,
    },
    summaryCard: {
        elevation: 2,
        marginTop: 16,
        marginBottom: 16,
    },
    summaryTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    summaryDivider: {
        marginBottom: 12,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    summaryLabel: {
        fontSize: 14,
    },
    summaryValue: {
        fontSize: 14,
        fontWeight: '600',
    },
    summaryAmount: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    submitButton: {
        marginTop: 24,
    },
    submitButtonContent: {
        paddingVertical: 8,
    },
});