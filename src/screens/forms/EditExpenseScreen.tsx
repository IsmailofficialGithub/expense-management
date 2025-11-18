// src/screens/forms/EditExpenseScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Text, TextInput, Button, SegmentedButtons, Chip, Divider, HelperText, Card, IconButton } from 'react-native-paper';
import { useGroups } from '../../hooks/useGroups';
import { useExpenses } from '../../hooks/useExpenses';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useNetworkCheck } from '../../hooks/useNetworkCheck';
import { useAppDispatch } from '../../store';
import { fetchExpense, updateExpense, fetchCategories } from '../../store/slices/expensesSlice';
import { fetchGroup } from '../../store/slices/groupsSlice';
import { ErrorHandler } from '../../utils/errorHandler';
import LoadingOverlay from '../../components/LoadingOverlay';
import * as ImagePicker from 'expo-image-picker';
import { format } from 'date-fns';
import SafeScrollView from '../../components/SafeScrollView';

interface Props {
  navigation: any;
  route: {
    params: {
      expenseId: string;
    };
  };
}

export default function EditExpenseScreen({ navigation, route }: Props) {
  const { expenseId } = route.params;
  const { selectedExpense, categories, loading } = useExpenses();
  const { selectedGroup } = useGroups();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const { isOnline } = useNetworkCheck();
  const dispatch = useAppDispatch();

  // Form state
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [notes, setNotes] = useState('');
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [existingReceiptUrl, setExistingReceiptUrl] = useState<string | null>(null);
  const [splitType, setSplitType] = useState<'equal' | 'unequal'>('equal');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [customSplits, setCustomSplits] = useState<{ [userId: string]: string }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validation errors
  const [errors, setErrors] = useState({
    description: '',
    amount: '',
    category: '',
    members: '',
    splits: '',
  });

  useEffect(() => {
    loadExpenseData();
  }, [expenseId]);

  useEffect(() => {
    if (selectedExpense) {
      // Pre-fill form with existing data
      setDescription(selectedExpense.description);
      setAmount(selectedExpense.amount.toString());
      setSelectedCategoryId(selectedExpense.category_id);
      setSelectedDate(new Date(selectedExpense.date));
      setNotes(selectedExpense.notes || '');
      setExistingReceiptUrl(selectedExpense.receipt_url || null);
      setSplitType(selectedExpense.split_type as 'equal' | 'unequal');

      // Set selected members and custom splits
      if (selectedExpense.splits) {
        const memberIds = selectedExpense.splits.map(s => s.user_id);
        setSelectedMembers(memberIds);

        if (selectedExpense.split_type === 'unequal') {
          const splits: { [key: string]: string } = {};
          selectedExpense.splits.forEach(split => {
            splits[split.user_id] = split.amount.toString();
          });
          setCustomSplits(splits);
        }
      }

      setIsLoading(false);
    }
  }, [selectedExpense]);

  const loadExpenseData = async () => {
    if (!isOnline) {
      showToast('Unable to load expense. No internet connection.', 'error');
      navigation.goBack();
      return;
    }

    try {
      await dispatch(fetchCategories()).unwrap();
      const expense = await dispatch(fetchExpense(expenseId)).unwrap();
      
      if (expense.group_id) {
        await dispatch(fetchGroup(expense.group_id)).unwrap();
      }
    } catch (error) {
      ErrorHandler.handleError(error, showToast, 'Load Expense');
      navigation.goBack();
    }
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant camera roll permissions to upload receipts.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setReceiptUri(result.assets[0].uri);
      setExistingReceiptUrl(null);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant camera permissions to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setReceiptUri(result.assets[0].uri);
      setExistingReceiptUrl(null);
    }
  };

  const toggleMember = (userId: string) => {
    if (selectedMembers.includes(userId)) {
      setSelectedMembers(selectedMembers.filter(id => id !== userId));
      const newSplits = { ...customSplits };
      delete newSplits[userId];
      setCustomSplits(newSplits);
    } else {
      setSelectedMembers([...selectedMembers, userId]);
      setCustomSplits({ ...customSplits, [userId]: '' });
    }
  };

  const calculateEqualSplit = () => {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || selectedMembers.length === 0) return 0;
    return amountNum / selectedMembers.length;
  };

  const validateForm = () => {
    const newErrors = {
      description: '',
      amount: '',
      category: '',
      members: '',
      splits: '',
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

    if (!selectedCategoryId) {
      newErrors.category = 'Please select a category';
      isValid = false;
    }

    if (selectedMembers.length === 0) {
      newErrors.members = 'Please select at least one member';
      isValid = false;
    }

    // Validate custom splits
    if (splitType === 'unequal') {
      const totalSplit = selectedMembers.reduce((sum, userId) => {
        const splitAmount = parseFloat(customSplits[userId] || '0');
        return sum + splitAmount;
      }, 0);

      if (Math.abs(totalSplit - amountNum) > 0.01) {
        newErrors.splits = `Splits must equal total amount (₹${amountNum.toFixed(2)}). Current: ₹${totalSplit.toFixed(2)}`;
        isValid = false;
      }
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    if (!isOnline) {
      showToast('Cannot update expense. No internet connection.', 'error');
      return;
    }

    Alert.alert(
      'Update Expense',
      'Are you sure you want to update this expense?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update',
          onPress: async () => {
            setIsSubmitting(true);

            const amountNum = parseFloat(amount);

            // Prepare splits
            const splits = selectedMembers.map(userId => {
              if (splitType === 'equal') {
                return {
                  user_id: userId,
                  amount: calculateEqualSplit(),
                };
              } else {
                return {
                  user_id: userId,
                  amount: parseFloat(customSplits[userId] || '0'),
                };
              }
            });

            // Prepare receipt file (if new image selected)
            let receiptFile: File | undefined;
            if (receiptUri) {
              try {
                const response = await fetch(receiptUri);
                const blob = await response.blob();
                receiptFile = new File([blob], 'receipt.jpg', { type: 'image/jpeg' }) as any;
              } catch (error) {
                ErrorHandler.logError(error, 'Receipt Upload');
                showToast('Failed to upload receipt', 'warning');
              }
            }

            try {
              await dispatch(updateExpense({
                expenseId,
                updates: {
                  category_id: selectedCategoryId,
                  description: description.trim(),
                  amount: amountNum,
                  date: format(selectedDate, 'yyyy-MM-dd'),
                  notes: notes.trim() || null,
                  split_type: splitType,
                },
                splits,
                receipt: receiptFile,
              })).unwrap();

              showToast('Expense updated successfully!', 'success');
              navigation.goBack();
            } catch (error) {
              ErrorHandler.handleError(error, showToast, 'Update Expense');
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  if (isLoading || !selectedExpense || !selectedGroup) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingOverlay visible={true} message="Loading expense..." />
      </View>
    );
  }

  const selectedCategory = categories.find(c => c.id === selectedCategoryId);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeScrollView contentContainerStyle={styles.content}>
        {/* Info Banner */}
        <Card style={styles.infoCard}>
          <Card.Content>
            <View style={styles.infoContent}>
              <IconButton icon="information" size={24} iconColor="#1976D2" />
              <Text style={styles.infoText}>
                Editing this expense will update splits for all members
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* Group Info (Read-only) */}
        <Text style={styles.sectionTitle}>Group</Text>
        <Card style={styles.readOnlyCard}>
          <Card.Content>
            <Text style={styles.readOnlyLabel}>This expense belongs to:</Text>
            <Text style={styles.readOnlyValue}>{selectedGroup.name}</Text>
          </Card.Content>
        </Card>

        {/* Description */}
        <Text style={styles.sectionTitle}>What did you pay for?</Text>
        <TextInput
          label="Description *"
          value={description}
          onChangeText={setDescription}
          mode="outlined"
          placeholder="e.g., Groceries, Dinner, Rent"
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

        <Divider style={styles.divider} />

        {/* Category Selection */}
        <Text style={styles.sectionTitle}>Category *</Text>
        {categories.length === 0 ? (
          <Text style={styles.noDataText}>Loading categories...</Text>
        ) : (
          <View style={styles.chipContainer}>
            {categories.map(category => (
              <Chip
                key={category.id}
                selected={selectedCategoryId === category.id}
                onPress={() => setSelectedCategoryId(category.id)}
                style={styles.chip}
                icon={() => <Text>{category.icon}</Text>}
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

        <Divider style={styles.divider} />

        {/* Split Type */}
        <Text style={styles.sectionTitle}>How to split?</Text>
        <SegmentedButtons
          value={splitType}
          onValueChange={(value) => setSplitType(value as 'equal' | 'unequal')}
          buttons={[
            { value: 'equal', label: 'Split Equally' },
            { value: 'unequal', label: 'Custom Amounts' },
          ]}
          style={styles.segmentedButtons}
        />

        {/* Member Selection */}
        <Text style={styles.sectionTitle}>Split with *</Text>
        <View style={styles.membersContainer}>
          {selectedGroup.members?.map(member => {
            const isSelected = selectedMembers.includes(member.user_id);
            const user = member.user;
            const splitAmount = splitType === 'equal' ? calculateEqualSplit() : parseFloat(customSplits[member.user_id] || '0');

            return (
              <Card
                key={member.user_id}
                style={[styles.memberCard, isSelected && styles.memberCardSelected]}
                onPress={() => toggleMember(member.user_id)}
              >
                <Card.Content style={styles.memberCardContent}>
                  <View style={styles.memberInfo}>
                    <Chip
                      selected={isSelected}
                      onPress={() => toggleMember(member.user_id)}
                      style={styles.memberChip}
                    >
                      {user?.full_name || 'Unknown'}
                    </Chip>
                    {isSelected && (
                      <Text style={styles.memberSplit}>
                        ₹{splitAmount.toFixed(2)}
                      </Text>
                    )}
                  </View>

                  {/* Custom split input */}
                  {isSelected && splitType === 'unequal' && (
                    <TextInput
                      value={customSplits[member.user_id]}
                      onChangeText={(value) => setCustomSplits({ ...customSplits, [member.user_id]: value })}
                      mode="outlined"
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      dense
                      left={<TextInput.Affix text="₹" />}
                      style={styles.splitInput}
                    />
                  )}
                </Card.Content>
              </Card>
            );
          })}
        </View>
        {errors.members ? (
          <HelperText type="error" visible={!!errors.members}>
            {errors.members}
          </HelperText>
        ) : null}
        {errors.splits ? (
          <HelperText type="error" visible={!!errors.splits}>
            {errors.splits}
          </HelperText>
        ) : null}

        <Divider style={styles.divider} />

        {/* Optional: Date, Notes, Receipt */}
        <Text style={styles.sectionTitle}>Additional Details (Optional)</Text>
        
        {/* Date - Simple display for now */}
        <Text style={styles.label}>Date</Text>
        <Text style={styles.dateText}>{format(selectedDate, 'MMMM dd, yyyy')}</Text>

        {/* Notes */}
        <TextInput
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          mode="outlined"
          multiline
          numberOfLines={3}
          placeholder="Add any additional details..."
          style={styles.input}
        />

        {/* Receipt */}
        <Text style={styles.label}>Receipt</Text>
        <View style={styles.receiptContainer}>
          {receiptUri || existingReceiptUrl ? (
            <View style={styles.receiptPreview}>
              <Text style={styles.receiptText}>
                {receiptUri ? 'New receipt selected ✓' : 'Receipt attached ✓'}
              </Text>
              <IconButton
                icon="close"
                size={20}
                onPress={() => {
                  setReceiptUri(null);
                  setExistingReceiptUrl(null);
                }}
              />
            </View>
          ) : (
            <View style={styles.receiptButtons}>
              <Button
                mode="outlined"
                icon="camera"
                onPress={handleTakePhoto}
                style={styles.receiptButton}
              >
                Take Photo
              </Button>
              <Button
                mode="outlined"
                icon="image"
                onPress={handlePickImage}
                style={styles.receiptButton}
              >
                Choose Image
              </Button>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <Button
            mode="outlined"
            onPress={() => navigation.goBack()}
            style={styles.actionButton}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            mode="contained"
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={isSubmitting}
            style={styles.actionButton}
          >
            Update Expense
          </Button>
        </View>
      </SafeScrollView>

      <LoadingOverlay visible={isSubmitting} message="Updating expense..." />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  infoCard: {
    marginBottom: 16,
    backgroundColor: '#E3F2FD',
    elevation: 2,
  },
  infoContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1565C0',
    lineHeight: 20,
  },
  readOnlyCard: {
    marginBottom: 16,
    backgroundColor: '#F5F5F5',
    elevation: 1,
  },
  readOnlyLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  readOnlyValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 12,
  },
  input: {
    marginBottom: 8,
  },
  divider: {
    marginVertical: 16,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    marginBottom: 8,
  },
  segmentedButtons: {
    marginBottom: 16,
  },
  membersContainer: {
    gap: 8,
  },
  memberCard: {
    backgroundColor: '#fff',
  },
  memberCardSelected: {
    backgroundColor: '#E8DEF8',
  },
  memberCardContent: {
    paddingVertical: 8,
  },
  memberInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  memberChip: {
    flex: 1,
  },
  memberSplit: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#6200EE',
    marginLeft: 12,
  },
  splitInput: {
    marginTop: 8,
  },
  noDataText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 8,
  },
  dateText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 16,
  },
  receiptContainer: {
    marginBottom: 16,
  },
  receiptPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E8F5E9',
    padding: 12,
    borderRadius: 8,
  },
  receiptText: {
    fontSize: 14,
    color: '#2E7D32',
    fontWeight: '500',
  },
  receiptButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  receiptButton: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  actionButton: {
    flex: 1,
  },
});