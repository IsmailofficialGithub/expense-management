// src/screens/forms/AddExpenseScreen.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
  StatusBar,
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
  useTheme,
} from "react-native-paper";
import { useGroups } from "../../hooks/useGroups";
import { useExpenses } from "../../hooks/useExpenses";
import { useAuth } from "../../hooks/useAuth";
import { useAppDispatch } from "../../store";
import { fetchGroups } from "../../store/slices/groupsSlice";
import { fetchCategories, createExpense } from "../../store/slices/expensesSlice";
import * as ImagePicker from "expo-image-picker";
import { format } from "date-fns";
import { ErrorHandler } from "../../utils/errorHandler";
import { useToast } from "../../hooks/useToast";
import { useNetworkCheck } from "../../hooks/useNetworkCheck";
import LoadingOverlay from "../../components/LoadingOverlay";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import SafeScrollView from "../../components/SafeScrollView";
type Props = NativeStackScreenProps<RootStackParamList, 'AddExpense'>;

export default function AddExpenseScreen({ navigation, route }: Props) {
  const theme = useTheme();
  console.log(theme);
  const { groups } = useGroups();
  const { categories, loading } = useExpenses();
  const { profile } = useAuth();
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const { isOnline } = useNetworkCheck();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const preSelectedGroupId = route?.params?.groupId;

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

  const [errors, setErrors] = useState({
    description: "",
    amount: "",
    group: "",
    category: "",
    members: "",
    splits: "",
  });

  useEffect(() => {
    dispatch(fetchGroups());
    dispatch(fetchCategories());
  }, [dispatch]);

  useEffect(() => {
    if (selectedGroupId) {
      const group = groups.find((g) => g.id === selectedGroupId);
      if (group && group.members) {
        const memberIds = group.members.map((m) => m.user_id);
        setSelectedMembers(memberIds);

        const splits: { [key: string]: string } = {};
        memberIds.forEach((id) => {
          splits[id] = "";
        });
        setCustomSplits(splits);
      }
    }
  }, [selectedGroupId, groups]);

  const onChangeDate = (
    event: DateTimePickerEvent,
    date?: Date
  ) => {
    const currentDate = date || selectedDate;
    setShowDatePicker(Platform.OS === "ios");
    setSelectedDate(currentDate);
  };

  const handlePickImage = async () => {
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

    if (!description.trim()) {
      newErrors.description = "Description is required";
      setErrors(newErrors);
      return "Description is required";
    }

    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      newErrors.amount = "Please enter a valid amount greater than 0";
      setErrors(newErrors);
      return "Please enter a valid amount";
    }

    if (!selectedGroupId) {
      newErrors.group = "Please select a group";
      setErrors(newErrors);
      return "Please select a group";
    }

    if (!selectedCategoryId) {
      newErrors.category = "Please select a category";
      setErrors(newErrors);
      return "Please select a category";
    }

    if (selectedMembers.length === 0) {
      newErrors.members = "Please select at least one member";
      setErrors(newErrors);
      return "Please select at least one member";
    }

    if (splitType === "unequal") {
      const totalSplit = selectedMembers.reduce((sum, userId) => {
        const splitAmount = parseFloat(customSplits[userId] || "0");
        return sum + splitAmount;
      }, 0);

      if (Math.abs(totalSplit - amountNum) > 0.01) {
        const errorMsg = `Splits must equal total amount (₹${amountNum.toFixed(2)})`;
        newErrors.splits = errorMsg;
        setErrors(newErrors);
        return errorMsg;
      }
    }

    setErrors(newErrors);
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validateForm();

    if (validationError) {
      showToast(validationError, "error");
      return;
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
      if (!isOnline) {
        // Receipts can't be uploaded offline, show warning but allow expense creation
        showToast("Receipt will be uploaded when connection is restored", "warning");
      } else {
        try {
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
      
      // Show different message based on online status
      if (isOnline) {
        showToast("Expense added successfully!", "success");
      } else {
        showToast("Expense saved offline. Will sync when connection is restored.", "info");
      }
      navigation.goBack();
    } catch (error) {
      ErrorHandler.handleError(error, showToast, "Add Expense");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="#6200EE" translucent={false} />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <SafeScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          hasTabBar={false}
        >
          <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Card.Content>
              <TextInput
                label="Description *"
                value={description}
                onChangeText={setDescription}
                mode="outlined"
                placeholder="e.g., Groceries, Dinner, Rent"
                error={!!errors.description}
                style={[styles.input, { backgroundColor: theme.colors.surface }]}
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

          <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Card.Content>
              <Text style={[styles.subtitle, { color: theme.colors.onSurface }]}>Which group? *</Text>
              {groups.length === 0 ? (
                <Text style={[styles.noDataText, { color: theme.colors.onSurfaceVariant }]}>Loading groups...</Text>
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

              <Text style={[styles.subtitle, { color: theme.colors.onSurface }]}>Category *</Text>
              {categories.length === 0 ? (
                <Text style={[styles.noDataText, { color: theme.colors.onSurfaceVariant }]}>Loading categories...</Text>
              ) : (
                <View style={styles.chipContainer}>
                  {categories.map((category) => {
                    const isSelected = selectedCategoryId === category.id;
                    return (
                      <Chip
                        key={category.id}
                        selected={isSelected}
                        onPress={() => setSelectedCategoryId(category.id)}
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

          <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Card.Content>
              <Text style={[styles.subtitle, { color: theme.colors.onSurface }]}>How to split? *</Text>
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
                  <Text style={[styles.subtitle, { color: theme.colors.onSurface }]}>Split with *</Text>
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
                            { backgroundColor: theme.colors.surface },
                            isSelected && { backgroundColor: theme.colors.primaryContainer },
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
                                <Text style={[styles.memberSplit, { color: theme.colors.primary }]}>
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

          <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Card.Content>
              <Text style={[styles.subtitle, { color: theme.colors.onSurface }]}>Additional Details (Optional)</Text>

              <TouchableOpacity onPress={() => setShowDatePicker(true)}>
                <TextInput
                  label="Date"
                  value={format(selectedDate, "MMMM dd, yyyy")}
                  mode="outlined"
                  editable={false}
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

              <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>Receipt</Text>
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
    paddingBottom: 32,
  },
  card: {
    marginBottom: 16,
    elevation: 2,
    borderRadius: 8,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "600",
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
    marginBottom: 8,
  },
  chipText: {},
  segmentedButtons: {
    marginBottom: 16,
  },
  membersContainer: {
    gap: 8,
  },
  memberCard: {
    borderRadius: 8,
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
    marginLeft: 12,
  },
  splitInput: {
    marginTop: 8,
  },
  noDataText: {
    fontSize: 14,
    fontStyle: "italic",
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
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
});
