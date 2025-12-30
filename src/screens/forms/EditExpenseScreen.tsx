// src/screens/forms/EditExpenseScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, Image, TouchableOpacity } from 'react-native';
import { Text, TextInput, Button, SegmentedButtons, Chip, Divider, HelperText, Card, IconButton, useTheme } from 'react-native-paper';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { expenseService } from '../../services/supabase.service';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

interface Props {
  navigation: any;
  route: {
    params: {
      expenseId: string;
    };
  };
}

export default function EditExpenseScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
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
  const [selectedPayerId, setSelectedPayerId] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Validation errors
  const [errors, setErrors] = useState({
    description: '',
    amount: '',
    category: '',
    members: '',
    splits: '',
    payer: '',
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

        setSelectedPayerId(selectedExpense.paid_by);
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
        const group = await dispatch(fetchGroup(expense.group_id)).unwrap();
        // Check if current user is admin
        const member = group.members.find((m: any) => m.user_id === profile?.id);
        setIsAdmin(member?.role === 'admin');
      }
    } catch (error) {
      ErrorHandler.handleError(error, showToast, 'Load Expense');
      navigation.goBack();
    }
  };

  const onChangeDate = (event: DateTimePickerEvent, date?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (date) {
      const newDate = new Date(selectedDate);
      newDate.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      setSelectedDate(newDate);
    }
  };

  const onChangeTime = (event: DateTimePickerEvent, date?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (date) {
      const newDate = new Date(selectedDate);
      newDate.setHours(date.getHours(), date.getMinutes());
      setSelectedDate(newDate);
    }
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant camera roll permissions to upload receipts.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
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
      payer: '',
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

    if (!selectedPayerId) {
      newErrors.payer = 'Please select who paid';
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
            let receiptFile: any;
            let shouldDeleteOldReceipt = false;

            if (receiptUri) {
              // New receipt selected - will replace old one
              receiptFile = {
                uri: receiptUri,
                name: 'receipt.jpg',
                type: 'image/jpeg'
              };
              // Mark old receipt for deletion if it exists
              if (existingReceiptUrl) {
                shouldDeleteOldReceipt = true;
              }
            } else if (!receiptUri && !existingReceiptUrl && selectedExpense?.receipt_url) {
              // User removed the receipt - delete from storage
              shouldDeleteOldReceipt = true;
            }

            try {
              // Delete old receipt if needed (before updating expense)
              if (shouldDeleteOldReceipt && selectedExpense?.receipt_url) {
                try {
                  await expenseService.deleteReceipt(selectedExpense.receipt_url);
                  console.log('✅ Old receipt deleted from storage');
                } catch (error) {
                  console.error('Failed to delete old receipt:', error);
                  // Continue anyway - don't block the update
                }
              }

              await dispatch(updateExpense({
                expenseId,
                updates: {
                  category_id: selectedCategoryId,
                  description: description.trim(),
                  amount: amountNum,
                  paid_by: selectedPayerId,
                  date: selectedDate.toISOString(),
                  notes: notes.trim() || null,
                  split_type: splitType,
                  // Set receipt_url to null if user removed it
                  ...(!receiptUri && !existingReceiptUrl && selectedExpense?.receipt_url ? { receipt_url: null } : {}),
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
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 32,
          }
        ]}
        hasTabBar={false}
      >
        {/* Info Banner */}
        <Card style={[styles.infoCard, { backgroundColor: theme.colors.primaryContainer }]}>
          <Card.Content>
            <View style={styles.infoContent}>
              <IconButton icon="information" size={24} iconColor={theme.colors.primary} />
              <Text style={[styles.infoText, { color: theme.colors.onPrimaryContainer }]}>
                Editing this expense will update splits for all members
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* Group Info (Read-only) */}
        <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Group</Text>
        <Card style={[styles.readOnlyCard, { backgroundColor: theme.colors.surfaceVariant }]}>
          <Card.Content>
            <Text style={[styles.readOnlyLabel, { color: theme.colors.onSurfaceVariant }]}>This expense belongs to:</Text>
            <Text style={[styles.readOnlyValue, { color: theme.colors.onSurface }]}>{selectedGroup.name}</Text>
          </Card.Content>
        </Card>

        {/* Description */}
        <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>What did you pay for?</Text>
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
        <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Category *</Text>
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

        {isAdmin && selectedGroup && (
          <>
            <Divider style={styles.divider} />
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Who paid? (Admin Only)</Text>
            <View style={styles.chipContainer}>
              {selectedGroup.members.map((member) => {
                const isSelected = selectedPayerId === member.user_id;
                return (
                  <Chip
                    key={member.user_id}
                    selected={isSelected}
                    onPress={() => setSelectedPayerId(member.user_id)}
                    style={styles.chip}
                    avatar={
                      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: theme.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 10, color: theme.colors.onPrimaryContainer }}>
                          {(member.user?.full_name || '?')[0].toUpperCase()}
                        </Text>
                      </View>
                    }
                  >
                    {member.user?.full_name || "Unknown"}
                    {member.user_id === profile?.id ? " (You)" : ""}
                  </Chip>
                );
              })}
            </View>
            {errors.payer ? (
              <HelperText type="error" visible={!!errors.payer}>
                {errors.payer}
              </HelperText>
            ) : null}
          </>
        )}

        <Divider style={styles.divider} />

        {/* Split Type */}
        <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>How to split?</Text>
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
        <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Split with *</Text>
        <View style={styles.membersContainer}>
          {selectedGroup.members?.map(member => {
            const isSelected = selectedMembers.includes(member.user_id);
            const user = member.user;
            const splitAmount = splitType === 'equal' ? calculateEqualSplit() : parseFloat(customSplits[member.user_id] || '0');

            return (
              <Card
                key={member.user_id}
                style={[
                  styles.memberCard,
                  { backgroundColor: theme.colors.surface },
                  isSelected && { backgroundColor: theme.colors.primaryContainer }
                ]}
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
                      <Text style={[styles.memberSplit, { color: theme.colors.primary }]}>
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
        <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Additional Details (Optional)</Text>

        <View style={styles.row}>
          <TouchableOpacity
            onPress={() => {
              if (isAdmin) {
                setShowDatePicker(true);
              } else {
                showToast("Only admins can change the date", "info");
              }
            }}
            style={[styles.flex1, { marginRight: 8 }]}
          >
            <TextInput
              label="Date"
              value={format(selectedDate, "MMM dd, yyyy")}
              mode="outlined"
              editable={false}
              left={<TextInput.Icon icon="calendar" />}
              style={styles.input}
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              if (isAdmin) {
                setShowTimePicker(true);
              } else {
                showToast("Only admins can change the time", "info");
              }
            }}
            style={styles.flex1}
          >
            <TextInput
              label="Time"
              value={format(selectedDate, "hh:mm a")}
              mode="outlined"
              editable={false}
              left={<TextInput.Icon icon="clock-outline" />}
              style={styles.input}
            />
          </TouchableOpacity>
        </View>

        {showDatePicker && (
          <DateTimePicker
            testID="datePicker"
            value={selectedDate}
            mode="date"
            display="default"
            onChange={onChangeDate}
          />
        )}

        {showTimePicker && (
          <DateTimePicker
            testID="timePicker"
            value={selectedDate}
            mode="time"
            display="default"
            onChange={onChangeTime}
          />
        )}

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
        <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>Receipt</Text>
        <View style={styles.receiptContainer}>
          {receiptUri || existingReceiptUrl ? (
            <View>
              {/* Image Preview */}
              <TouchableOpacity
                style={styles.imagePreviewContainer}
                activeOpacity={0.9}
              >
                <Image
                  source={{ uri: receiptUri || existingReceiptUrl || '' }}
                  style={styles.imagePreview}
                  resizeMode="cover"
                />
                {/* Remove button overlay */}
                <IconButton
                  icon="close-circle"
                  size={32}
                  iconColor="white"
                  containerColor="rgba(0,0,0,0.6)"
                  style={styles.removeButton}
                  onPress={() => {
                    setReceiptUri(null);
                    setExistingReceiptUrl(null);
                  }}
                />
              </TouchableOpacity>
              {/* Info text */}
              <Text style={[styles.receiptInfoText, { color: theme.colors.onSurfaceVariant }]}>
                {receiptUri ? '📸 New receipt selected' : '📎 Current receipt'}
              </Text>
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
  },
  infoCard: {
    marginBottom: 16,
    elevation: 2,
  },
  infoContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  readOnlyCard: {
    marginBottom: 16,
    elevation: 1,
  },
  readOnlyLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  readOnlyValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
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
  },
  memberCardSelected: {
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
    marginLeft: 12,
  },
  splitInput: {
    marginTop: 8,
  },
  noDataText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  dateText: {
    fontSize: 16,
    marginBottom: 16,
  },
  receiptContainer: {
    marginBottom: 16,
  },
  receiptPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
  },
  receiptText: {
    fontSize: 14,
    fontWeight: '500',
  },
  receiptButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  receiptButton: {
    flex: 1,
  },
  imagePreviewContainer: {
    position: 'relative',
    width: '100%',
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
    backgroundColor: '#f0f0f0',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  removeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  receiptInfoText: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
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