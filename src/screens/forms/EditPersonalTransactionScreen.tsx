// src/screens/forms/EditPersonalTransactionScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import {
  Text,
  TextInput,
  Button,
  SegmentedButtons,
  Chip,
  HelperText,
  Card,
  IconButton,
  useTheme,
} from 'react-native-paper';
import SafeScrollView from '../../components/SafeScrollView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePersonalFinance } from '../../hooks/usePersonalFinance';
import { useToast } from '../../hooks/useToast';
import { useNetworkCheck } from '../../hooks/useNetworkCheck';
import { useAppDispatch } from '../../store';
import {
  updatePersonalTransaction,
  deletePersonalTransaction,
  fetchPersonalCategories,
} from '../../store/slices/personalFinanceSlice';
import { ErrorHandler } from '../../utils/errorHandler';
import LoadingOverlay from '../../components/LoadingOverlay';
import { format } from 'date-fns';

interface Props {
  navigation: any;
  route: {
    params: {
      transactionId: string;
    };
  };
}

export default function EditPersonalTransactionScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { transactionId } = route.params;
  const { transactions, categories, loading } = usePersonalFinance();
  const { showToast } = useToast();
  const { isOnline } = useNetworkCheck();
  const dispatch = useAppDispatch();

  // Find the transaction
  const transaction = transactions.find(t => t.id === transactionId);

  // Form state
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [date, setDate] = useState(new Date());
  const [notes, setNotes] = useState('');

  // Validation errors
  const [errors, setErrors] = useState({
    description: '',
    amount: '',
    category: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    // Load categories
    dispatch(fetchPersonalCategories());
  }, []);

  useEffect(() => {
    // Populate form with transaction data
    if (transaction) {
      setType(transaction.type);
      setDescription(transaction.description);
      setAmount(transaction.amount.toString());
      setSelectedCategory(transaction.category);
      setDate(new Date(transaction.date));
      setNotes(transaction.notes || '');
    }
  }, [transaction]);

  useEffect(() => {
    // Check if form has changes
    if (transaction) {
      const changed =
        type !== transaction.type ||
        description.trim() !== transaction.description ||
        parseFloat(amount) !== Number(transaction.amount) ||
        selectedCategory !== transaction.category ||
        notes.trim() !== (transaction.notes || '');

      setHasChanges(changed);
    }
  }, [type, description, amount, selectedCategory, notes, transaction]);

  if (!transaction) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Transaction not found</Text>
        <Button mode="contained" onPress={() => navigation.goBack()}>
          Go Back
        </Button>
      </View>
    );
  }

  // Filter categories by type
  const filteredCategories = categories.filter(c => c.type === type);

  const validateForm = (): boolean => {
    const newErrors = {
      description: '',
      amount: '',
      category: '',
    };

    let isValid = true;

    if (!description.trim()) {
      newErrors.description = 'Description is required';
      isValid = false;
    }

    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      newErrors.amount = 'Please enter a valid amount greater than 0';
      isValid = false;
    }

    if (!selectedCategory) {
      newErrors.category = 'Please select a category';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleUpdate = async () => {
    // Check network first
    if (!isOnline) {
      showToast('Cannot update transaction. No internet connection.', 'error');
      return;
    }

    if (!validateForm()) return;

    if (!hasChanges) {
      showToast('No changes to save', 'info');
      return;
    }

    setIsSubmitting(true);

    try {
      await dispatch(
        updatePersonalTransaction({
          id: transactionId,
          updates: {
            type,
            category: selectedCategory,
            amount: parseFloat(amount),
            description: description.trim(),
            date: format(date, 'yyyy-MM-dd'),
            notes: notes.trim() || null,
          },
        })
      ).unwrap();

      showToast('Transaction updated successfully!', 'success');
      navigation.goBack();
    } catch (error) {
      ErrorHandler.handleError(error, showToast, 'Update Transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Transaction',
      'Are you sure you want to delete this transaction? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!isOnline) {
              showToast('Cannot delete transaction. No internet connection.', 'error');
              return;
            }

            setIsSubmitting(true);
            try {
              await dispatch(deletePersonalTransaction(transactionId)).unwrap();
              showToast('Transaction deleted successfully', 'success');
              navigation.goBack();
            } catch (error) {
              ErrorHandler.handleError(error, showToast, 'Delete Transaction');
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const handleCancel = () => {
    if (hasChanges) {
      Alert.alert(
        'Discard Changes',
        'You have unsaved changes. Are you sure you want to discard them?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } else {
      navigation.goBack();
    }
  };

  return (
    <SafeScrollView 
      contentContainerStyle={[
        { padding: 16 },
        {
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 32,
        }
      ]} 
      hasTabBar={false}
    >
      {/* Original Transaction Info */}
      <Card style={[styles.originalCard, { backgroundColor: theme.colors.errorContainer }]}>
        <Card.Content>
          <View style={styles.originalHeader}>
            <Text style={[styles.originalTitle, { color: theme.colors.onErrorContainer }]}>Original Transaction</Text>
            <IconButton
              icon="delete"
              size={20}
              iconColor={theme.colors.error}
              onPress={handleDelete}
            />
          </View>
          <View style={styles.originalRow}>
            <Text style={[styles.originalLabel, { color: theme.colors.onErrorContainer }]}>Created:</Text>
            <Text style={[styles.originalValue, { color: theme.colors.onErrorContainer }]}>
              {format(new Date(transaction.created_at), 'MMM dd, yyyy HH:mm')}
            </Text>
          </View>
          <View style={styles.originalRow}>
            <Text style={[styles.originalLabel, { color: theme.colors.onErrorContainer }]}>Last Updated:</Text>
            <Text style={[styles.originalValue, { color: theme.colors.onErrorContainer }]}>
              {format(new Date(transaction.updated_at), 'MMM dd, yyyy HH:mm')}
            </Text>
          </View>
        </Card.Content>
      </Card>

      {/* Type Selector */}
      <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Transaction Type</Text>
      <SegmentedButtons
        value={type}
        onValueChange={(value) => {
          const newType = value as 'income' | 'expense';
          setType(newType);

          // Reset category if current category doesn't exist in new type
          const categoryExistsInNewType = categories.some(
            c => c.type === newType && c.name === selectedCategory
          );
          if (!categoryExistsInNewType) {
            setSelectedCategory('');
          }
        }}
        buttons={[
          {
            value: 'income',
            label: 'Income',
            icon: 'arrow-down-circle',
            style: type === 'income' ? styles.incomeButton : undefined,
          },
          {
            value: 'expense',
            label: 'Expense',
            icon: 'arrow-up-circle',
            style: type === 'expense' ? styles.expenseButton : undefined,
          },
        ]}
        style={styles.typeSelector}
      />

      {/* Description */}
      <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>What is this {type}?</Text>
      <TextInput
        label={`${type === 'income' ? 'Income' : 'Expense'} Description *`}
        value={description}
        onChangeText={setDescription}
        mode="outlined"
        placeholder={
          type === 'income'
            ? 'e.g., Salary, Freelance Project, Gift'
            : 'e.g., Groceries, Rent, Shopping'
        }
        error={!!errors.description}
        style={styles.input}
      />
      {errors.description ? (
        <HelperText type="error" visible={!!errors.description}>
          {errors.description}
        </HelperText>
      ) : null}

      {/* Amount */}
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

      {/* Category Selection */}
      <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Category *</Text>
      {filteredCategories.length === 0 ? (
        <Text style={styles.noDataText}>Loading categories...</Text>
      ) : (
        <View style={styles.categoryContainer}>
          {filteredCategories.map((category) => (
            <Chip
              key={category.id}
              selected={selectedCategory === category.name}
              onPress={() => setSelectedCategory(category.name)}
              style={[
                styles.categoryChip,
                selectedCategory === category.name &&
                (type === 'income'
                  ? { backgroundColor: theme.colors.primaryContainer }
                  : { backgroundColor: theme.colors.errorContainer }),
              ]}
              icon={() => <Text style={[styles.categoryIcon, { color: theme.colors.onSurface }]}>{category.icon}</Text>}
              textStyle={[styles.categoryText, { color: theme.colors.onSurface }]}
            >
              {category.name}
            </Chip>
          ))}
        </View>
      )}
      {errors.category ? (
        <HelperText type="error" visible={!!errors.category}>
          {errors.category}
        </HelperText>
      ) : null}

      {/* Date Display */}
      <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Date</Text>
      <Card style={[styles.dateCard, { backgroundColor: theme.colors.surface }]}>
        <Card.Content style={styles.dateContent}>
          <Text style={[styles.dateLabel, { color: theme.colors.onSurfaceVariant }]}>Transaction Date</Text>
          <Text style={[styles.dateValue, { color: theme.colors.onSurface }]}>{format(date, 'MMMM dd, yyyy')}</Text>
        </Card.Content>
      </Card>
      <HelperText type="info" visible>
        Date editing coming soon. Currently locked to original date.
      </HelperText>

      {/* Notes (Optional) */}
      <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Additional Notes (Optional)</Text>
      <TextInput
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        mode="outlined"
        multiline
        numberOfLines={4}
        placeholder="Add any additional details..."
        style={styles.input}
      />

      {/* Changes Indicator */}
      {hasChanges && (
        <Card style={[styles.changesCard, { backgroundColor: theme.colors.errorContainer }]}>
          <Card.Content style={styles.changesContent}>
            <IconButton icon="alert-circle" size={20} iconColor={theme.colors.warning || theme.colors.error} />
            <Text style={[styles.changesText, { color: theme.colors.onErrorContainer }]}>You have unsaved changes</Text>
          </Card.Content>
        </Card>
      )}

      {/* Summary Card */}
      <Card
        style={[
          styles.summaryCard,
          type === 'income' 
            ? { backgroundColor: theme.colors.primaryContainer }
            : { backgroundColor: theme.colors.errorContainer },
        ]}
      >
        <Card.Content>
          <Text style={[styles.summaryTitle, { color: theme.colors.onSurface }]}>Updated Transaction Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.colors.onSurfaceVariant }]}>Type:</Text>
            <Text style={[styles.summaryValue, { color: theme.colors.onSurface }]}>
              {type === 'income' ? '💰 Income' : '💸 Expense'}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Amount:</Text>
            <Text
              style={[
                styles.summaryValue,
                styles.summaryAmount,
                type === 'income' ? styles.incomeText : styles.expenseText,
              ]}
            >
              {type === 'income' ? '+' : '-'}₹{amount || '0.00'}
            </Text>
          </View>
          {selectedCategory && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Category:</Text>
              <Text style={styles.summaryValue}>{selectedCategory}</Text>
            </View>
          )}
          {description && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: theme.colors.onSurfaceVariant }]}>Description:</Text>
              <Text style={[styles.summaryValue, { color: theme.colors.onSurface }]} numberOfLines={1}>
                {description}
              </Text>
            </View>
          )}
        </Card.Content>
      </Card>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <Button
          mode="outlined"
          onPress={handleCancel}
          style={styles.cancelButton}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          mode="contained"
          onPress={handleUpdate}
          style={styles.updateButton}
          contentStyle={styles.updateButtonContent}
          loading={isSubmitting}
          disabled={isSubmitting || !hasChanges}
          icon="content-save"
        >
          Save Changes
        </Button>
      </View>

      {/* Delete Button */}
      <Button
        mode="outlined"
        onPress={handleDelete}
        style={styles.deleteButton}
        textColor="#F44336"
        icon="delete"
        disabled={isSubmitting}
      >
        Delete Transaction
      </Button>

      <LoadingOverlay visible={isSubmitting} message="Processing..." />
    </SafeScrollView>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 18,
    marginBottom: 16,
    fontWeight: '600',
  },
  originalCard: {
    marginBottom: 16,
    borderLeftWidth: 4,
  },
  originalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  originalTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  originalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  originalLabel: {
    fontSize: 12,
  },
  originalValue: {
    fontSize: 12,
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 12,
  },
  typeSelector: {
    marginBottom: 8,
  },
  incomeButton: {
  },
  expenseButton: {
  },
  input: {
    marginBottom: 8,
  },
  categoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  categoryChip: {
    marginBottom: 8,
  },
  selectedIncomeChip: {
  },
  selectedExpenseChip: {
  },
  categoryIcon: {
    fontSize: 16,
  },
  categoryText: {
    fontSize: 13,
  },
  dateCard: {
    marginBottom: 4,
  },
  dateContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateLabel: {
    fontSize: 14,
  },
  dateValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  changesCard: {
    marginTop: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
  },
  changesContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  changesText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  summaryCard: {
    marginTop: 16,
    marginBottom: 16,
    elevation: 4,
  },
  incomeSummaryCard: {
    borderLeftWidth: 4,
  },
  expenseSummaryCard: {
    borderLeftWidth: 4,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
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
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  summaryAmount: {
    fontSize: 18,
  },
  incomeText: {
  },
  expenseText: {
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  cancelButton: {
    flex: 1,
  },
  updateButton: {
    flex: 2,
  },
  updateButtonContent: {
    paddingVertical: 8,
  },
  deleteButton: {
    marginBottom: 16,
  },
  noDataText: {
    fontSize: 14,
    fontStyle: 'italic',
    marginBottom: 8,
  },
});