// src/screens/forms/AddPersonalTransactionScreen.tsx

// ADD TO NAVIGATION:
// In src/navigation/AppNavigator.tsx, add these screens to MainStack:
// 
// import PersonalFinanceScreen from '../screens/main/PersonalFinanceScreen';
// import AddPersonalTransactionScreen from '../screens/forms/AddPersonalTransactionScreen';
// import EditPersonalTransactionScreen from '../screens/forms/EditPersonalTransactionScreen';
// 
// <Stack.Screen name="PersonalFinance" component={PersonalFinanceScreen} 
//   options={{ title: 'Personal Finance' }} />
// <Stack.Screen name="AddPersonalTransaction" component={AddPersonalTransactionScreen} 
//   options={{ title: 'Add Transaction' }} />
// <Stack.Screen name="EditPersonalTransaction" component={EditPersonalTransactionScreen} 
//   options={{ title: 'Edit Transaction' }} />
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
} from 'react-native-paper';
import SafeScrollView from '../../components/SafeScrollView';
import { usePersonalFinance } from '../../hooks/usePersonalFinance';
import { useToast } from '../../hooks/useToast';
import { useNetworkCheck } from '../../hooks/useNetworkCheck';
import { useAppDispatch } from '../../store';
import {
  createPersonalTransaction,
  fetchPersonalCategories,
} from '../../store/slices/personalFinanceSlice';
import { ErrorHandler } from '../../utils/errorHandler';
import LoadingOverlay from '../../components/LoadingOverlay';
import { format } from 'date-fns';

interface Props {
  navigation: any;
  route?: {
    params?: {
      type?: 'income' | 'expense';
    };
  };
}

export default function AddPersonalTransactionScreen({ navigation, route }: Props) {
  const { categories, loading } = usePersonalFinance();
  const { showToast } = useToast();
  const { isOnline } = useNetworkCheck();
  const dispatch = useAppDispatch();

  // Pre-selected type from navigation params (optional)
  const preSelectedType = route?.params?.type;

  // Form state
  const [type, setType] = useState<'income' | 'expense'>(preSelectedType || 'expense');
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

  useEffect(() => {
    // Load categories
    dispatch(fetchPersonalCategories());
  }, []);

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

  const handleSubmit = async () => {
    // Check network first
    if (!isOnline) {
      showToast('Cannot add transaction. No internet connection.', 'error');
      return;
    }

    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      await dispatch(
        createPersonalTransaction({
          type,
          category: selectedCategory,
          amount: parseFloat(amount),
          description: description.trim(),
          date: format(date, 'yyyy-MM-dd'),
          notes: notes.trim() || undefined,
        })
      ).unwrap();

      showToast(
        `${type === 'income' ? 'Income' : 'Expense'} added successfully!`,
        'success'
      );
      navigation.goBack();
    } catch (error) {
      ErrorHandler.handleError(error, showToast, 'Add Transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    Alert.alert('Clear Form', 'Are you sure you want to clear all fields?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          setDescription('');
          setAmount('');
          setSelectedCategory('');
          setNotes('');
          setErrors({ description: '', amount: '', category: '' });
        },
      },
    ]);
  };

  return (
    <SafeScrollView contentContainerStyle={{ padding: 16 }} hasTabBar={false}>
      {/* Type Selector */}
      <Text style={styles.sectionTitle}>Transaction Type</Text>
      <SegmentedButtons
        value={type}
        onValueChange={(value) => {
          setType(value as 'income' | 'expense');
          setSelectedCategory(''); // Reset category when type changes
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
        Defaults to today. You can edit this later.
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

      {/* Summary Card */}
      <Card
        style={[
          styles.summaryCard,
          type === 'income' ? styles.incomeSummaryCard : styles.expenseSummaryCard,
        ]}
      >
        <Card.Content>
          <Text style={styles.summaryTitle}>Transaction Summary</Text>
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
          onPress={handleReset}
          style={styles.resetButton}
          disabled={isSubmitting}
        >
          Clear
        </Button>
        <Button
          mode="contained"
          onPress={handleSubmit}
          style={styles.submitButton}
          contentStyle={styles.submitButtonContent}
          loading={isSubmitting}
          disabled={isSubmitting}
          icon={type === 'income' ? 'arrow-down-circle' : 'arrow-up-circle'}
        >
          Add {type === 'income' ? 'Income' : 'Expense'}
        </Button>
      </View>

      <LoadingOverlay visible={isSubmitting} message="Adding transaction..." />
    </SafeScrollView>
  );
}

const styles = StyleSheet.create({
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
  },
  resetButton: {
    flex: 1,
  },
  submitButton: {
    flex: 2,
  },
  submitButtonContent: {
    paddingVertical: 8,
  },
  noDataText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 8,
  },
});