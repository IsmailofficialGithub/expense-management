// src/screens/forms/AddExpenseScreen.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
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

export default function AddExpenseScreen({ navigation, route }: any) {
  const { groups } = useGroups();
  const { categories, loading } = useExpenses();
  const { profile } = useAuth();
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const { isOnline } = useNetworkCheck();

  const [isSubmitting, setIsSubmitting] = useState(false);

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
  }, []);

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

  const handlePickImage = async () => {
    // Request permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission Required",
        "Please grant camera roll permissions to upload receipts."
      );
      return;
    }

    // Pick image
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
    // Request permission
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission Required",
        "Please grant camera permissions to take photos."
      );
      return;
    }

    // Take photo
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
      // Remove from custom splits
      const newSplits = { ...customSplits };
      delete newSplits[userId];
      setCustomSplits(newSplits);
    } else {
      setSelectedMembers([...selectedMembers, userId]);
      // Add to custom splits
      setCustomSplits({ ...customSplits, [userId]: "" });
    }
  };

  const calculateEqualSplit = () => {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || selectedMembers.length === 0) return 0;
    return amountNum / selectedMembers.length;
  };

  const validateForm = () => {
    const newErrors = {
      description: "",
      amount: "",
      group: "",
      category: "",
      members: "",
      splits: "",
    };

    let isValid = true;

    if (!description.trim()) {
      newErrors.description = "Description is required";
      isValid = false;
    }

    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      newErrors.amount = "Please enter a valid amount greater than 0";
      isValid = false;
    }

    if (!selectedGroupId) {
      newErrors.group = "Please select a group";
      isValid = false;
    }

    if (!selectedCategoryId) {
      newErrors.category = "Please select a category";
      isValid = false;
    }

    if (selectedMembers.length === 0) {
      newErrors.members = "Please select at least one member";
      isValid = false;
    }

    // Validate custom splits
    if (splitType === "unequal") {
      const totalSplit = selectedMembers.reduce((sum, userId) => {
        const splitAmount = parseFloat(customSplits[userId] || "0");
        return sum + splitAmount;
      }, 0);

      if (Math.abs(totalSplit - amountNum) > 0.01) {
        newErrors.splits = `Splits must equal total amount (₹${amountNum.toFixed(
          2
        )}). Current: ₹${totalSplit.toFixed(2)}`;
        isValid = false;
      }
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async () => {
    const handleSubmit = async () => {
     if (!isOnline) {
      showToast('Cannot add expense. No internet connection.', 'error');
      return;
    }

    if (!validateForm()) return;

    setIsSubmitting(true);

      const amountNum = parseFloat(amount);

      // Prepare splits
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

      // Prepare receipt file (if exists)
      let receiptFile: File | undefined;
      if (receiptUri) {
        try {
          const response = await fetch(receiptUri);
          const blob = await response.blob();
          receiptFile = new File([blob], "receipt.jpg", {
            type: "image/jpeg",
          }) as any;
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
      }
    };

    const selectedGroup = groups.find((g) => g.id === selectedGroupId);
    const selectedCategory = categories.find(
      (c) => c.id === selectedCategoryId
    );

    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView contentContainerStyle={styles.content}>
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

          {/* Group Selection */}
          <Text style={styles.sectionTitle}>Which group?</Text>
          {groups.length === 0 ? (
            <Text style={styles.noDataText}>
              No groups available. Create a group first.
            </Text>
          ) : (
            <View style={styles.chipContainer}>
              {groups.map((group) => (
                <Chip
                  key={group.id}
                  selected={selectedGroupId === group.id}
                  onPress={() => setSelectedGroupId(group.id)}
                  style={styles.chip}
                >
                  {group.name}
                </Chip>
              ))}
            </View>
          )}
          {errors.group ? (
            <HelperText type="error" visible={!!errors.group}>
              {errors.group}
            </HelperText>
          ) : null}

          <Divider style={styles.divider} />

          {/* Category Selection */}
          <Text style={styles.sectionTitle}>Category *</Text>
          {categories.length === 0 ? (
            <Text style={styles.noDataText}>Loading categories...</Text>
          ) : (
            <View style={styles.chipContainer}>
              {categories.map((category) => (
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
            onValueChange={(value) =>
              setSplitType(value as "equal" | "unequal")
            }
            buttons={[
              { value: "equal", label: "Split Equally" },
              { value: "unequal", label: "Custom Amounts" },
            ]}
            style={styles.segmentedButtons}
          />

          {/* Member Selection */}
          {selectedGroup && (
            <>
              <Text style={styles.sectionTitle}>Split with *</Text>
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

                        {/* Custom split input */}
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

          <Divider style={styles.divider} />

          {/* Optional: Date, Notes, Receipt */}
          <Text style={styles.sectionTitle}>Additional Details (Optional)</Text>

          {/* Date - Simple display for now */}
          <Text style={styles.label}>Date</Text>
          <Text style={styles.dateText}>
            {format(selectedDate, "MMMM dd, yyyy")}
          </Text>

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

          {/* Submit Button */}
          <Button
            mode="contained"
            onPress={handleSubmit}
            loading={loading}
            disabled={loading}
            style={styles.submitButton}
            contentStyle={styles.submitButtonContent}
          >
            Add Expense
          </Button>
        </ScrollView>
          <LoadingOverlay 
        visible={isSubmitting} 
        message="Creating expense..." 
      />
      </KeyboardAvoidingView>
    );
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "#f5f5f5",
    },
    content: {
      padding: 16,
      paddingBottom: 32,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: "#333",
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
      flexDirection: "row",
      flexWrap: "wrap",
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
      backgroundColor: "#fff",
    },
    memberCardSelected: {
      backgroundColor: "#E8DEF8",
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
    dateText: {
      fontSize: 16,
      color: "#333",
      marginBottom: 16,
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
}
