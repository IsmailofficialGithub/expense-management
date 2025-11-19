// src/screens/forms/AddExpenseScreen.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity, // Import for date picker
} from "react-native";
import {
  Text,
  TextInput,
  Button,
  SegmentedButtons,
  Chip,
  Divider,
  HelperText,
  Card,
  IconButton,
  useTheme, // Import useTheme for colors
} from "react-native-paper";
import { useGroups } from "../../hooks/useGroups";
import { useExpenses } from "../../hooks/useExpenses";
import { useAuth } from "../../hooks/useAuth";
import { useAppDispatch } from "../../store";
import { createExpense } from "../../store/slices/expensesSlice";
import { fetchGroups } from "../../store/slices/groupsSlice";
import { fetchCategories } from "../../store/slices/expensesSlice";
import * as ImagePicker from "expo-image-picker";
import { format } from "date-fns";
import { ErrorHandler } from "../../utils/errorHandler";
import { useToast } from "../../hooks/useToast";
import { useNetworkCheck } from "../../hooks/useNetworkCheck";
import LoadingOverlay from "../../components/LoadingOverlay";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker"; // Import Date Picker

// Import type-safe props
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import SafeScrollView from "../../components/SafeScrollView";
type Props = NativeStackScreenProps<RootStackParamList, 'AddExpense'>;

export default function AddExpenseScreen({ navigation, route }: Props) {
  const theme = useTheme(); // Get theme for colors
  const { groups } = useGroups();
  const { categories, loading } = useExpenses();
  const { profile } = useAuth();
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const { isOnline } = useNetworkCheck();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false); // For date picker

  // Pre-selected group from navigation params (optional)
  const preSelectedGroupId = route?.params?.groupId;

  // Form state
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState(
    preSelectedGroupId || ""
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [notes, setNotes] = useState("");
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [splitType, setSplitType] = useState<"equal" | "unequal">("equal");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [customSplits, setCustomSplits] = useState<{
    [userId: string]: string;
  }>({});

  // Validation errors
  const [errors, setErrors] = useState({
    description: "",
    amount: "",
    group: "",
    category: "",
    members: "",
    splits: "",
  });

  useEffect(() => {
    // Load groups and categories
    dispatch(fetchGroups());
    dispatch(fetchCategories());
  }, [dispatch]);

  // Auto-select all group members when group is selected
  useEffect(() => {
    if (selectedGroupId) {
      const group = groups.find((g) => g.id === selectedGroupId);
      if (group && group.members) {
        const memberIds = group.members.map((m) => m.user_id);
        setSelectedMembers(memberIds);

        // Initialize custom splits
        const splits: { [key: string]: string } = {};
        memberIds.forEach((id) => {
          splits[id] = "";
        });
        setCustomSplits(splits);
      }
    }
  }, [selectedGroupId, groups]);

  // Date picker handler
  const onChangeDate = (
    event: DateTimePickerEvent,
    date?: Date
  ) => {
    const currentDate = date || selectedDate;
    setShowDatePicker(Platform.OS === "ios");
    setSelectedDate(currentDate);
  };

  const handlePickImage = async () => {
    // ... (no changes to this function)
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission Required",
        "Please grant camera roll permissions to upload receipts."
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setReceiptUri(result.assets[0].uri);
    }
  };

  const handleTakePhoto = async () => {
    // ... (no changes to this function)
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission Required",
        "Please grant camera permissions to take photos."
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setReceiptUri(result.assets[0].uri);
    }
  };

  const toggleMember = (userId: string) => {
    // ... (no changes to this function)
    if (selectedMembers.includes(userId)) {
      setSelectedMembers(selectedMembers.filter((id) => id !== userId));
      const newSplits = { ...customSplits };
      delete newSplits[userId];
      setCustomSplits(newSplits);
    } else {
      setSelectedMembers([...selectedMembers, userId]);
      setCustomSplits({ ...customSplits, [userId]: "" });
    }
  };

  const calculateEqualSplit = () => {
    // ... (no changes to this function)
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || selectedMembers.length === 0) return 0;
    return amountNum / selectedMembers.length;
  };

  const validateForm = (): string | null => {
  const newErrors = {
    description: "",
    amount: "",
    group: "",
    category: "",
    members: "",
    splits: "",
  };

  // 1. Check Description
  if (!description.trim()) {
    newErrors.description = "Description is required";
    setErrors(newErrors);
    return "Description is required"; // Return the specific error
  }

  // 2. Check Amount
  const amountNum = parseFloat(amount);
  if (!amount || isNaN(amountNum) || amountNum <= 0) {
    newErrors.amount = "Please enter a valid amount greater than 0";
    setErrors(newErrors);
    return "Please enter a valid amount"; // Return the specific error
  }

  // 3. Check Group
  if (!selectedGroupId) {
    newErrors.group = "Please select a group";
    setErrors(newErrors);
    return "Please select a group"; // Return the specific error
  }

  // 4. Check Category
  if (!selectedCategoryId) {
    newErrors.category = "Please select a category";
    setErrors(newErrors);
    return "Please select a category"; // Return the specific error
  }

  // 5. Check Members
  if (selectedMembers.length === 0) {
    newErrors.members = "Please select at least one member";
    setErrors(newErrors);
    return "Please select at least one member"; // Return the specific error
  }

  // 6. Check Custom Splits
  if (splitType === "unequal") {
    const totalSplit = selectedMembers.reduce((sum, userId) => {
      const splitAmount = parseFloat(customSplits[userId] || "0");
      return sum + splitAmount;
    }, 0);

    if (Math.abs(totalSplit - amountNum) > 0.01) {
      const errorMsg = `Splits must equal total amount (₹${amountNum.toFixed(2)})`;
      newErrors.splits = errorMsg;
      setErrors(newErrors);
      return errorMsg; // Return the specific error
    }
  }

  // 7. No Errors Found
  setErrors(newErrors); // Clear any old errors
  return null; // Return null if valid
};
  const handleSubmit = async () => {
    // ... (no changes to this function)
    if (!isOnline) {
      showToast("Cannot add expense. No internet connection.", "error");
      return;
    }
  const validationError = validateForm();

  if (validationError) {
    showToast(validationError, "error");
    return; // Stop the function
  }
    setIsSubmitting(true);
    const amountNum = parseFloat(amount);
    const splits = selectedMembers.map((userId) => {
      if (splitType === "equal") {
        return {
          user_id: userId,
          amount: calculateEqualSplit(),
        };
      } else {
        return {
          user_id: userId,
          amount: parseFloat(customSplits[userId] || "0"),
        };
      }
    });
   let receiptFile: any = undefined;
if (receiptUri) {
  try {
    // For React Native, we need to create a proper file object
    const filename = receiptUri.split('/').pop() || 'receipt.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : 'image/jpeg';

    receiptFile = {
      uri: receiptUri,
      name: filename,
      type: type,
    };
  } catch (error) {
    ErrorHandler.logError(error, "Receipt Upload");
    showToast("Failed to upload receipt", "warning");
  }
}
    try {
      await dispatch(
        createExpense({
          group_id: selectedGroupId,
          category_id: selectedCategoryId,
          description: description.trim(),
          amount: amountNum,
          paid_by: profile!.id,
          date: format(selectedDate, "yyyy-MM-dd"),
          notes: notes.trim() || undefined,
          split_type: splitType,
          splits,
          receipt: receiptFile,
        })
      ).unwrap();
      showToast("Expense added successfully!", "success");
      navigation.goBack();
    } catch (error) {
      ErrorHandler.handleError(error, showToast, "Add Expense");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <SafeScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        hasTabBar={false}
      >
        {/* === CARD 1: Main Details === */}
        <Card style={styles.card}>
          <Card.Content>
            <TextInput
              label="Description *"
              value={description}
              onChangeText={setDescription}
              mode="outlined"
              placeholder="e.g., Groceries, Dinner, Rent"
              error={!!errors.description}
              style={styles.input}
              left={<TextInput.Icon icon="format-text" />}
            />
            {errors.description ? (
              <HelperText type="error" visible={!!errors.description}>
                {errors.description}
              </HelperText>
            ) : null}

            <TextInput
              label="Amount *"
              value={amount}
              onChangeText={setAmount}
              mode="outlined"
              keyboardType="decimal-pad"
              placeholder="0.00"
              error={!!errors.amount}
              left={<TextInput.Icon icon="currency-inr" />}
              style={styles.input}
            />
            {errors.amount ? (
              <HelperText type="error" visible={!!errors.amount}>
                {errors.amount}
              </HelperText>
            ) : null}
          </Card.Content>
        </Card>

        {/* === CARD 2: Group & Category === */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.subtitle}>Which group? *</Text>
            {groups.length === 0 ? (
              <Text style={styles.noDataText}>Loading groups...</Text>
            ) : (
              <View style={styles.chipContainer}>
                {groups.map((group) => {
                  const isSelected = selectedGroupId === group.id;
                  return (
                    <Chip
                      key={group.id}
                      selected={isSelected}
                      onPress={() => setSelectedGroupId(group.id)}
                      style={[
                        styles.chip,
                        isSelected && {
                          backgroundColor: theme.colors.primary,
                        },
                      ]}
                      textStyle={[
                        styles.chipText,
                        isSelected && {
                          color: theme.colors.onPrimary,
                        },
                      ]}
                    >
                      {group.name}
                    </Chip>
                  );
                })}
              </View>
            )}
            {errors.group ? (
              <HelperText type="error" visible={!!errors.group}>
                {errors.group}
              </HelperText>
            ) : null}

            <Divider style={styles.divider} />

            <Text style={styles.subtitle}>Category *</Text>
            {categories.length === 0 ? (
              <Text style={styles.noDataText}>Loading categories...</Text>
            ) : (
              <View style={styles.chipContainer}>
                {categories.map((category) => {
                  const isSelected = selectedCategoryId === category.id;
                  return (
                    <Chip
                      key={category.id}
                      selected={isSelected} // This adds the checkmark icon
                      onPress={() => setSelectedCategoryId(category.id)}
                      // *** THIS IS THE FIX FOR YOUR BUG ***
                      // We manually apply styles to make selection obvious
                      style={[
                        styles.chip,
                        isSelected && {
                          backgroundColor: theme.colors.primary, // Or theme.colors.primaryContainer
                        },
                      ]}
                      textStyle={[
                        styles.chipText,
                        isSelected && {
                          color: theme.colors.onPrimary, // Or theme.colors.onPrimaryContainer
                        },
                      ]}
                      icon={() => <Text>{category.icon}</Text>}
                    >
                      {category.name}
                    </Chip>
                  );
                })}
              </View>
            )}
            {errors.category ? (
              <HelperText type="error" visible={!!errors.category}>
                {errors.category}
              </HelperText>
            ) : null}
          </Card.Content>
        </Card>

        {/* === CARD 3: Split Details === */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.subtitle}>How to split? *</Text>
            <SegmentedButtons
              value={splitType}
              onValueChange={(value) =>
                setSplitType(value as "equal" | "unequal")
              }
              buttons={[
                { value: "equal", label: "Split Equally" },
                { value: "unequal", label: "Custom Amounts" },
              ]}
              style={styles.segmentedButtons}
            />

            {selectedGroup && (
              <>
                <Text style={styles.subtitle}>Split with *</Text>
                <View style={styles.membersContainer}>
                  {selectedGroup.members?.map((member) => {
                    const isSelected = selectedMembers.includes(member.user_id);
                    const user = member.user;
                    const splitAmount =
                      splitType === "equal"
                        ? calculateEqualSplit()
                        : parseFloat(customSplits[member.user_id] || "0");

                    return (
                      <Card
                        key={member.user_id}
                        style={[
                          styles.memberCard,
                          isSelected && styles.memberCardSelected,
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
                              {user?.full_name || "Unknown"}
                            </Chip>
                            {isSelected && (
                              <Text style={styles.memberSplit}>
                                ₹{splitAmount.toFixed(2)}
                              </Text>
                            )}
                          </View>

                          {isSelected && splitType === "unequal" && (
                            <TextInput
                              value={customSplits[member.user_id]}
                              onChangeText={(value) =>
                                setCustomSplits({
                                  ...customSplits,
                                  [member.user_id]: value,
                                })
                              }
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
              </>
            )}
          </Card.Content>
        </Card>

        {/* === CARD 4: Additional Details === */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.subtitle}>Additional Details (Optional)</Text>

            {/* Date Picker */}
            <TouchableOpacity onPress={() => setShowDatePicker(true)}>
              <TextInput
                label="Date"
                value={format(selectedDate, "MMMM dd, yyyy")}
                mode="outlined"
                editable={false} // Make it not editable
                left={<TextInput.Icon icon="calendar" />}
                style={styles.input}
              />
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                testID="dateTimePicker"
                value={selectedDate}
                mode="date"
                display="default"
                onChange={onChangeDate}
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
              left={<TextInput.Icon icon="note-text-outline" />}
            />

            {/* Receipt */}
            <Text style={styles.label}>Receipt</Text>
            <View style={styles.receiptContainer}>
              {receiptUri ? (
                <View style={styles.receiptPreview}>
                  <Text style={styles.receiptText}>Receipt attached ✓</Text>
                  <IconButton
                    icon="close"
                    size={20}
                    onPress={() => setReceiptUri(null)}
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
          </Card.Content>
        </Card>

        {/* Submit Button */}
        <Button
          mode="contained"
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={isSubmitting}
          style={styles.submitButton}
          contentStyle={styles.submitButtonContent}
        >
          Add Expense
        </Button>
      </SafeScrollView>
      <LoadingOverlay
        visible={isSubmitting}
        message="Creating expense..."
      />
    </KeyboardAvoidingView>
  );
}

// *** NEW STYLES ADDED/UPDATED ***
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: "#fff",
    marginBottom: 16,
    elevation: 2,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  input: {
    marginBottom: 8,
  },
  divider: {
    marginVertical: 16,
  },
  chipContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    // Base style for all chips
    marginBottom: 8,
  },
  chipText: {
    // Base text style
  },
  // NOTE: Selected style is now applied inline using the theme
  segmentedButtons: {
    marginBottom: 16,
  },
  membersContainer: {
    gap: 8,
  },
  memberCard: {
    backgroundColor: "#fff",
  },
  memberCardSelected: {
    backgroundColor: "#E8DEF8", // This color is from Paper's theme
  },
  memberCardContent: {
    paddingVertical: 8,
  },
  memberInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  memberChip: {
    flex: 1,
  },
  memberSplit: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#6200EE",
    marginLeft: 12,
  },
  splitInput: {
    marginTop: 8,
  },
  noDataText: {
    fontSize: 14,
    color: "#666",
    fontStyle: "italic",
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666",
    marginBottom: 8,
  },
  receiptContainer: {
    marginBottom: 16,
  },
  receiptPreview: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#E8F5E9",
    padding: 12,
    borderRadius: 8,
  },
  receiptText: {
    fontSize: 14,
    color: "#2E7D32",
    fontWeight: "500",
  },
  receiptButtons: {
    flexDirection: "row",
    gap: 8,
  },
  receiptButton: {
    flex: 1,
  },
  submitButton: {
    marginTop: 24,
  },
  submitButtonContent: {
    paddingVertical: 8,
  },
  // Old styles no longer needed
  // sectionTitle: { ... }
  // dateText: { ... }
});