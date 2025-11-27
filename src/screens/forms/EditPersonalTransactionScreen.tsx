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
} from 'react-native-paper';
import SafeScrollView from '../../components/SafeScrollView';
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
    <SafeScrollView contentContainerStyle={{ padding: 16 }} hasTabBar={false}>
      {/* Original Transaction Info */}
      <Card style={styles.originalCard}>
        <Card.Content>
          <View style={styles.originalHeader}>
            <Text style={styles.originalTitle}>Original Transaction</Text>
            <IconButton
              icon="delete"
              size={20}
              iconColor="#F44336"
              onPress={handleDelete}
            />
          </View>
          <View style={styles.originalRow}>
            <Text style={styles.originalLabel}>Created:</Text>
            <Text style={styles.originalValue}>
              {format(new Date(transaction.created_at), 'MMM dd, yyyy HH:mm')}
            </Text>
          </View>
          <View style={styles.originalRow}>
            <Text style={styles.originalLabel}>Last Updated:</Text>
            <Text style={styles.originalValue}>
              {format(new Date(transaction.updated_at), 'MMM dd, yyyy HH:mm')}
            </Text>
          </View>
        </Card.Content>
      </Card>

      {/* Type Selector */}
      <Text style={styles.sectionTitle}>Transaction Type</Text>
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
      <Text style={styles.sectionTitle}>What is this {type}?</Text>
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
      <Text style={styles.sectionTitle}>Category *</Text>
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
                  ? styles.selectedIncomeChip
                  : styles.selectedExpenseChip),
              ]}
              icon={() => <Text style={styles.categoryIcon}>{category.icon}</Text>}
              textStyle={styles.categoryText}
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
      <Text style={styles.sectionTitle}>Date</Text>
      <Card style={styles.dateCard}>
        <Card.Content style={styles.dateContent}>
          <Text style={styles.dateLabel}>Transaction Date</Text>
          <Text style={styles.dateValue}>{format(date, 'MMMM dd, yyyy')}</Text>
        </Card.Content>
      </Card>
      <HelperText type="info" visible>
        Date editing coming soon. Currently locked to original date.
      </HelperText>

      {/* Notes (Optional) */}
      <Text style={styles.sectionTitle}>Additional Notes (Optional)</Text>
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
        <Card style={styles.changesCard}>
          <Card.Content style={styles.changesContent}>
            <IconButton icon="alert-circle" size={20} iconColor="#FF9800" />
            <Text style={styles.changesText}>You have unsaved changes</Text>
          </Card.Content>
        </Card>
      )}

      {/* Summary Card */}
      <Card
        style={[
          styles.summaryCard,
          type === 'income' ? styles.incomeSummaryCard : styles.expenseSummaryCard,
        ]}
      >
        <Card.Content>
          <Text style={styles.summaryTitle}>Updated Transaction Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Type:</Text>
            <Text style={styles.summaryValue}>
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
              <Text style={styles.summaryLabel}>Description:</Text>
              <Text style={styles.summaryValue} numberOfLines={1}>
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
    backgroundColor: '#f5f5f5',
  },
  errorText: {
    fontSize: 18,
    color: '#F44336',
    marginBottom: 16,
    fontWeight: '600',
  },
  originalCard: {
    backgroundColor: '#E3F2FD',
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
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
    color: '#1976D2',
  },
  originalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  originalLabel: {
    fontSize: 12,
    color: '#666',
  },
  originalValue: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 12,
  },
  typeSelector: {
    marginBottom: 8,
  },
  incomeButton: {
    backgroundColor: '#E8F5E9',
  },
  expenseButton: {
    backgroundColor: '#FFEBEE',
  },
  input: {
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  categoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  categoryChip: {
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  selectedIncomeChip: {
    backgroundColor: '#4CAF50',
  },
  selectedExpenseChip: {
    backgroundColor: '#F44336',
  },
  categoryIcon: {
    fontSize: 16,
  },
  categoryText: {
    fontSize: 13,
  },
  dateCard: {
    backgroundColor: '#fff',
    marginBottom: 4,
  },
  dateContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateLabel: {
    fontSize: 14,
    color: '#666',
  },
  dateValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  changesCard: {
    backgroundColor: '#FFF3E0',
    marginTop: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  changesContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  changesText: {
    fontSize: 14,
    color: '#F57C00',
    fontWeight: '600',
    marginLeft: 8,
  },
  summaryCard: {
    marginTop: 16,
    marginBottom: 16,
    elevation: 4,
  },
  incomeSummaryCard: {
    backgroundColor: '#E8F5E9',
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  expenseSummaryCard: {
    backgroundColor: '#FFEBEE',
    borderLeftWidth: 4,
    borderLeftColor: '#F44336',
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
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
    color: '#666',
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
  summaryAmount: {
    fontSize: 18,
  },
  incomeText: {
    color: '#4CAF50',
  },
  expenseText: {
    color: '#F44336',
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
    borderColor: '#F44336',
    marginBottom: 16,
  },
  noDataText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 8,
  },
});