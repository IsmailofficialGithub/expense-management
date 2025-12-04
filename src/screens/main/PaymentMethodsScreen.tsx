// src/screens/main/PaymentMethodsScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Alert, Pressable } from 'react-native';
import { Text, Card, FAB, IconButton, Chip, Switch, List, Divider } from 'react-native-paper';
import * as Clipboard from 'expo-clipboard';
import { usePaymentMethods } from '../../hooks/usePaymentMethods';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useNetworkCheck } from '../../hooks/useNetworkCheck';
import { useAppDispatch } from '../../store';
import { fetchPaymentMethods, setDefaultPaymentMethod, deletePaymentMethod, updatePaymentMethod } from '../../store/slices/paymentMethodsSlice';
import LoadingOverlay from '../../components/LoadingOverlay';
import ErrorState from '../../components/ErrorState';
import { useTheme } from 'react-native-paper';
import { ErrorHandler } from '../../utils/errorHandler';

export default function PaymentMethodsScreen({ navigation }: any) {
  const theme = useTheme();
  const { paymentMethods, defaultMethod, loading } = usePaymentMethods();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const { isOnline } = useNetworkCheck();
  const dispatch = useAppDispatch();

  const [refreshing, setRefreshing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedMethods, setExpandedMethods] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadPaymentMethods();
  }, []);

  const loadPaymentMethods = async () => {
    setError(null);
    try {
      if (!isOnline) {
        showToast('Unable to load payment methods. No internet connection.', 'error');
        return;
      }

      await dispatch(fetchPaymentMethods(profile!.id)).unwrap();
    } catch (error: any) {
      const errorMessage = ErrorHandler.getUserFriendlyMessage(error);
      setError(errorMessage);
      console.error('Load payment methods error:', error);
      showToast('Failed to load payment methods', 'error');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadPaymentMethods();
    } catch (error) {
      // Error already handled in loadPaymentMethods
    } finally {
      setRefreshing(false);
    }
  };

  const handleSetDefault = async (methodId: string) => {
    setIsProcessing(true);
    try {
      await dispatch(setDefaultPaymentMethod(methodId)).unwrap();
      if (isOnline) {
        showToast('Default payment method updated', 'success');
      } else {
        showToast('Default payment method saved offline. Will sync when connection is restored.', 'info');
      }
    } catch (error: any) {
      console.error('Set default error:', error);
      showToast('Failed to set default payment method', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleVisibility = async (methodId: string, currentVisibility: boolean) => {
    setIsProcessing(true);
    try {
      await dispatch(updatePaymentMethod({
        methodId,
        updates: { is_visible_to_groups: !currentVisibility }
      })).unwrap();
      
      if (isOnline) {
        showToast(
          !currentVisibility 
            ? 'Payment method is now visible to group members' 
            : 'Payment method is now hidden from group members',
          'success'
        );
      } else {
        showToast('Visibility updated offline. Will sync when connection is restored.', 'info');
      }
    } catch (error: any) {
      console.error('Toggle visibility error:', error);
      showToast('Failed to update visibility', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = (methodId: string, methodName: string) => {
    Alert.alert(
      'Delete Payment Method',
      `Are you sure you want to delete "${methodName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(true);
            try {
              await dispatch(deletePaymentMethod(methodId)).unwrap();
              if (isOnline) {
                showToast('Payment method deleted', 'success');
              } else {
                showToast('Payment method deleted offline. Will sync when connection is restored.', 'info');
              }
            } catch (error: any) {
              console.error('Delete error:', error);
              showToast('Failed to delete payment method', 'error');
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };

  const getMethodIcon = (methodType: string): string => {
    switch (methodType) {
      case 'cash':
        return 'cash';
      case 'bank':
        return 'bank';
      case 'jazzcash':
      case 'easypaisa':
        return 'cellphone';
      case 'card':
        return 'credit-card';
      default:
        return 'wallet';
    }
  };

  const getMethodName = (method: any): string => {
    switch (method.method_type) {
      case 'cash':
        return 'Cash';
      case 'bank':
        return method.bank_name || 'Bank Transfer';
      case 'jazzcash':
        return `JazzCash (${method.phone_number || ''})`;
      case 'easypaisa':
        return `EasyPaisa (${method.phone_number || ''})`;
      case 'card':
        return `Card ${method.card_last_four ? `****${method.card_last_four}` : ''}`;
      case 'other':
        return method.custom_name || 'Other';
      default:
        return method.method_type;
    }
  };

  const getMethodDetails = (method: any): string => {
    const details: string[] = [];

    if (method.method_type === 'bank') {
      if (method.account_title) details.push(method.account_title);
      if (method.account_number) details.push(`Acc: ${method.account_number}`);
      if (method.iban) details.push(`IBAN: ${method.iban}`);
    } else if (method.method_type === 'jazzcash' || method.method_type === 'easypaisa') {
      if (method.phone_number) details.push(method.phone_number);
    } else if (method.method_type === 'card') {
      if (method.card_last_four) details.push(`****${method.card_last_four}`);
    }

    if (method.notes) details.push(method.notes);

    return details.join(' • ');
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await Clipboard.setStringAsync(text);
      showToast(`${label} copied to clipboard`, 'success');
    } catch (error) {
      console.error('Failed to copy:', error);
      showToast('Failed to copy', 'error');
    }
  };

  const renderBankAccountDetails = (method: any) => {
    if (method.method_type !== 'bank') return null;

    return (
      <View style={styles.accountDetailsContainer}>
        {method.account_title && (
          <Pressable
            onPress={() => copyToClipboard(method.account_title, 'Account Name')}
            style={styles.detailRow}
          >
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Name:</Text>
              <Text style={styles.detailValue}>{method.account_title}</Text>
            </View>
            <IconButton
              icon="content-copy"
              size={18}
              iconColor={theme.colors.primary}
              onPress={() => copyToClipboard(method.account_title, 'Account Name')}
            />
          </Pressable>
        )}
        {method.account_number && (
          <Pressable
            onPress={() => copyToClipboard(method.account_number, 'Account Number')}
            style={styles.detailRow}
          >
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Account No:</Text>
              <Text style={styles.detailValue}>{method.account_number}</Text>
            </View>
            <IconButton
              icon="content-copy"
              size={18}
              iconColor={theme.colors.primary}
              onPress={() => copyToClipboard(method.account_number, 'Account Number')}
            />
          </Pressable>
        )}
        {method.iban && (
          <Pressable
            onPress={() => copyToClipboard(method.iban, 'IBAN')}
            style={styles.detailRow}
          >
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>IBAN:</Text>
              <Text style={styles.detailValue}>{method.iban}</Text>
            </View>
            <IconButton
              icon="content-copy"
              size={18}
              iconColor={theme.colors.primary}
              onPress={() => copyToClipboard(method.iban, 'IBAN')}
            />
          </Pressable>
        )}
        {method.notes && (
          <View style={styles.detailRow}>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Notes:</Text>
              <Text style={styles.detailValue}>{method.notes}</Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderPhoneNumberDetails = (method: any) => {
    if (method.method_type !== 'jazzcash' && method.method_type !== 'easypaisa') return null;
    if (!method.phone_number) return null;

    return (
      <Pressable
        onPress={() => copyToClipboard(method.phone_number, 'Phone Number')}
        style={styles.detailRow}
      >
        <View style={styles.detailContent}>
          <Text style={styles.detailLabel}>Phone:</Text>
          <Text style={styles.detailValue}>{method.phone_number}</Text>
        </View>
        <IconButton
          icon="content-copy"
          size={18}
          iconColor={theme.colors.primary}
          onPress={() => copyToClipboard(method.phone_number, 'Phone Number')}
        />
      </Pressable>
    );
  };

  const toggleMethodExpansion = (methodId: string) => {
    setExpandedMethods(prev => {
      const newSet = new Set(prev);
      if (newSet.has(methodId)) {
        newSet.delete(methodId);
      } else {
        newSet.add(methodId);
      }
      return newSet;
    });
  };

  const isMethodExpanded = (methodId: string) => expandedMethods.has(methodId);

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <IconButton icon="credit-card-outline" size={80} iconColor="#ccc" />
      <Text style={styles.emptyTitle}>No Payment Methods</Text>
      <Text style={styles.emptyText}>
        Add a payment method to track how you pay for expenses
      </Text>
    </View>
  );

  // Show error state if there's an error and no payment methods
  if (error && paymentMethods.length === 0 && !loading) {
    return (
      <View style={styles.container}>
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null);
            loadPaymentMethods();
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Info Card */}
        <Card style={styles.infoCard}>
          <Card.Content>
            <Text style={styles.infoText}>
              💡 Add your preferred payment methods and choose which ones to share with group members for easy settlements.
            </Text>
          </Card.Content>
        </Card>

        {paymentMethods.length === 0 ? (
          renderEmptyState()
        ) : (
          <>
            {/* Default Payment Method */}
            {defaultMethod && (
              <>
                <Text style={styles.sectionTitle}>Default Payment Method</Text>
                <Card style={styles.defaultCard}>
                  <Card.Content style={styles.cardContent}>
                    <Pressable onPress={() => toggleMethodExpansion(defaultMethod.id)}>
                      <View style={styles.methodHeader}>
                        <IconButton
                          icon={getMethodIcon(defaultMethod.method_type)}
                          size={32}
                          iconColor={theme.colors.primary}
                        />
                        <View style={styles.methodInfo}>
                          <Text style={styles.methodName}>
                            {getMethodName(defaultMethod)}
                          </Text>
                          {defaultMethod.method_type !== 'bank' && getMethodDetails(defaultMethod) ? (
                            <Text style={styles.methodDetails}>
                              {getMethodDetails(defaultMethod)}
                            </Text>
                          ) : null}
                          <Chip
                            icon="star"
                            style={styles.defaultBadge}
                            textStyle={styles.defaultBadgeText}
                            compact
                            mode="flat"
                          >
                            Default
                          </Chip>
                        </View>
                        <IconButton
                          icon={isMethodExpanded(defaultMethod.id) ? 'chevron-up' : 'chevron-down'}
                          size={24}
                          iconColor={theme.colors.onSurfaceVariant}
                          onPress={() => toggleMethodExpansion(defaultMethod.id)}
                        />
                      </View>
                    </Pressable>

                    {isMethodExpanded(defaultMethod.id) && (
                      <>
                        {defaultMethod.method_type === 'bank' && renderBankAccountDetails(defaultMethod)}
                        {renderPhoneNumberDetails(defaultMethod)}
                        
                        <Divider style={styles.divider} />

                        <List.Item
                          title="Visible to Group Members"
                          description={defaultMethod.is_visible_to_groups ? 'Group members can see this' : 'Only you can see this'}
                          left={props => <List.Icon {...props} icon="eye" />}
                          right={() => (
                            <Switch
                              value={defaultMethod.is_visible_to_groups}
                              onValueChange={() => handleToggleVisibility(defaultMethod.id, defaultMethod.is_visible_to_groups)}
                              disabled={isProcessing}
                            />
                          )}
                        />

                        <Divider style={styles.divider} />

                        <View style={styles.cardActions}>
                          <IconButton
                            icon="pencil"
                            size={20}
                            onPress={() => navigation.navigate('EditPaymentMethod', { methodId: defaultMethod.id })}
                          />
                          <IconButton
                            icon="delete"
                            size={20}
                            iconColor={theme.colors.error}
                            onPress={() => handleDelete(defaultMethod.id, getMethodName(defaultMethod))}
                          />
                        </View>
                      </>
                    )}
                  </Card.Content>
                </Card>
              </>
            )}

            {/* Other Payment Methods */}
            {paymentMethods.filter((m: any) => !m.is_default).length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Other Payment Methods</Text>
                {paymentMethods
                  .filter((m: any) => !m.is_default)
                  .map((method: any) => (
                    <Card key={method.id} style={styles.methodCard}>
                      <Card.Content style={styles.cardContent}>
                        <Pressable onPress={() => toggleMethodExpansion(method.id)}>
                          <View style={styles.methodHeader}>
                            <IconButton
                              icon={getMethodIcon(method.method_type)}
                              size={32}
                              iconColor={theme.colors.onSurfaceVariant}
                            />
                          <View style={styles.methodInfo}>
                            <Text style={styles.methodName}>
                              {getMethodName(method)}
                            </Text>
                            {method.method_type !== 'bank' && getMethodDetails(method) ? (
                              <Text style={styles.methodDetails}>
                                {getMethodDetails(method)}
                              </Text>
                            ) : null}
                          </View>
                            <IconButton
                              icon={isMethodExpanded(method.id) ? 'chevron-up' : 'chevron-down'}
                              size={24}
                              iconColor={theme.colors.onSurfaceVariant}
                              onPress={() => toggleMethodExpansion(method.id)}
                            />
                          </View>
                        </Pressable>

                        {isMethodExpanded(method.id) && (
                          <>
                            {method.method_type === 'bank' && renderBankAccountDetails(method)}
                            {renderPhoneNumberDetails(method)}
                            
                            <Divider style={styles.divider} />

                            <List.Item
                              title="Set as Default"
                              description="Use this method by default"
                              left={props => <List.Icon {...props} icon="star-outline" />}
                              onPress={() => handleSetDefault(method.id)}
                            />

                            <Divider />

                            <List.Item
                              title="Visible to Group Members"
                              description={method.is_visible_to_groups ? 'Group members can see this' : 'Only you can see this'}
                              left={props => <List.Icon {...props} icon="eye" />}
                              right={() => (
                                <Switch
                                  value={method.is_visible_to_groups}
                                  onValueChange={() => handleToggleVisibility(method.id, method.is_visible_to_groups)}
                                  disabled={isProcessing}
                                />
                              )}
                            />

                            <Divider style={styles.divider} />

                            <View style={styles.cardActions}>
                              <IconButton
                                icon="pencil"
                                size={20}
                                onPress={() => navigation.navigate('EditPaymentMethod', { methodId: method.id })}
                              />
                              <IconButton
                                icon="delete"
                                size={20}
                                iconColor="#F44336"
                                onPress={() => handleDelete(method.id, getMethodName(method))}
                              />
                            </View>
                          </>
                        )}
                      </Card.Content>
                    </Card>
                  ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Floating Action Button */}
      <FAB
        icon="plus"
        label="Add Payment Method"
        style={styles.fab}
        onPress={() => navigation.navigate('AddPaymentMethod')}
      />

      <LoadingOverlay visible={isProcessing} message="Processing..." />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 80,
  },
  infoCard: {
    marginBottom: 16,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 12,
  },
  defaultCard: {
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#6200EE',
  },
  methodCard: {
    marginBottom: 12,
  },
  cardContent: {
    paddingVertical: 12,
  },
  methodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  methodInfo: {
    flex: 1,
    marginLeft: 8,
  },
  methodName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  methodDetails: {
    fontSize: 12,
    marginBottom: 8,
  },
  defaultBadge: {
    alignSelf: 'flex-start',
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  defaultBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    textAlignVertical: 'center',
  },
  divider: {
    marginVertical: 8,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
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
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
  accountDetailsContainer: {
    marginVertical: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  detailContent: {
    flex: 1,
    marginRight: 8,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    color: '#000',
  },
});