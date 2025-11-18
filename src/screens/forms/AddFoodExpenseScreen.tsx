// src/screens/forms/AddFoodExpenseScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Text, TextInput, Button, SegmentedButtons, Chip, Divider, HelperText, Card, IconButton, Portal, Modal, List, Searchbar } from 'react-native-paper';
import { useGroups } from '../../hooks/useGroups';
import { useHotels } from '../../hooks/useHotels';
import { usePaymentMethods } from '../../hooks/usePaymentMethods';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useNetworkCheck } from '../../hooks/useNetworkCheck';
import { useAppDispatch } from '../../store';
import { fetchGroups } from '../../store/slices/groupsSlice';
import { fetchHotels } from '../../store/slices/hotelsSlice';
import { fetchPaymentMethods } from '../../store/slices/paymentMethodsSlice';
import { fetchCategories } from '../../store/slices/expensesSlice';
import { foodExpenseService } from '../../services/supabase.service';
import { format } from 'date-fns';
import LoadingOverlay from '../../components/LoadingOverlay';
import { FoodItemInput, HotelMenuItem } from '../../types/database.types';

interface Props {
  navigation: any;
  route?: {
    params?: {
      groupId?: string;
    };
  };
}

interface SelectedFoodItem extends FoodItemInput {
  menu_item?: HotelMenuItem;
}

export default function AddFoodExpenseScreen({ navigation, route }: Props) {
  const preSelectedGroupId = route?.params?.groupId;
  
  const { groups } = useGroups();
  const { hotels } = useHotels();
  const { paymentMethods, defaultMethod } = usePaymentMethods();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const { isOnline } = useNetworkCheck();
  const dispatch = useAppDispatch();

  // Form state
  const [description, setDescription] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState(preSelectedGroupId || '');
  const [selectedHotelId, setSelectedHotelId] = useState('');
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState(defaultMethod?.id || '');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [notes, setNotes] = useState('');
  const [splitType, setSplitType] = useState<'equal' | 'unequal'>('equal');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [customSplits, setCustomSplits] = useState<{ [userId: string]: string }>({});

  // Food items state
  const [selectedFoodItems, setSelectedFoodItems] = useState<SelectedFoodItem[]>([]);
  const [menuItemModalVisible, setMenuItemModalVisible] = useState(false);
  const [manualItemModalVisible, setManualItemModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Manual item inputs
  const [manualItemName, setManualItemName] = useState('');
  const [manualItemPrice, setManualItemPrice] = useState('');
  const [manualItemQuantity, setManualItemQuantity] = useState('1');

  // Validation errors
  const [errors, setErrors] = useState({
    description: '',
    group: '',
    hotel: '',
    items: '',
    members: '',
    splits: '',
    paymentMethod: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedGroupId) {
      const group = groups.find(g => g.id === selectedGroupId);
      if (group && group.members) {
        const memberIds = group.members.map(m => m.user_id);
        setSelectedMembers(memberIds);
        
        const splits: { [key: string]: string } = {};
        memberIds.forEach(id => {
          splits[id] = '';
        });
        setCustomSplits(splits);
      }
    }
  }, [selectedGroupId, groups]);

  useEffect(() => {
    if (defaultMethod) {
      setSelectedPaymentMethodId(defaultMethod.id);
    }
  }, [defaultMethod]);

  const loadData = async () => {
    if (!isOnline) {
      showToast('Unable to load data. No internet connection.', 'error');
      return;
    }

    try {
      await Promise.all([
        dispatch(fetchGroups()).unwrap(),
        dispatch(fetchHotels()).unwrap(),
        dispatch(fetchPaymentMethods(profile!.id)).unwrap(),
        dispatch(fetchCategories()).unwrap(),
      ]);
    } catch (error: any) {
      console.error('Load data error:', error);
      showToast('Failed to load data', 'error');
    }
  };

  const calculateTotalAmount = (): number => {
    return selectedFoodItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  };

  const calculateEqualSplit = (): number => {
    const total = calculateTotalAmount();
    if (selectedMembers.length === 0) return 0;
    return total / selectedMembers.length;
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

  const handleAddMenuItem = (menuItem: HotelMenuItem) => {
    // Check if item already added
    const existing = selectedFoodItems.find(item => item.menu_item_id === menuItem.id);
    
    if (existing) {
      // Increase quantity
      setSelectedFoodItems(
        selectedFoodItems.map(item =>
          item.menu_item_id === menuItem.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      // Add new item
      setSelectedFoodItems([
        ...selectedFoodItems,
        {
          hotel_id: selectedHotelId,
          menu_item_id: menuItem.id,
          item_name: menuItem.item_name,
          quantity: 1,
          unit_price: Number(menuItem.price),
          menu_item: menuItem,
        },
      ]);
    }

    setMenuItemModalVisible(false);
    setSearchQuery('');
  };

  const handleAddManualItem = () => {
    if (!manualItemName.trim()) {
      showToast('Please enter item name', 'error');
      return;
    }

    const price = parseFloat(manualItemPrice);
    const quantity = parseInt(manualItemQuantity);

    if (isNaN(price) || price <= 0) {
      showToast('Please enter valid price', 'error');
      return;
    }

    if (isNaN(quantity) || quantity <= 0) {
      showToast('Please enter valid quantity', 'error');
      return;
    }

    setSelectedFoodItems([
      ...selectedFoodItems,
      {
        hotel_id: selectedHotelId,
        menu_item_id: null,
        item_name: manualItemName.trim(),
        quantity: quantity,
        unit_price: price,
      },
    ]);

    // Reset manual inputs
    setManualItemName('');
    setManualItemPrice('');
    setManualItemQuantity('1');
    setManualItemModalVisible(false);
  };

  const handleUpdateQuantity = (index: number, newQuantity: number) => {
    if (newQuantity <= 0) {
      handleRemoveItem(index);
      return;
    }

    setSelectedFoodItems(
      selectedFoodItems.map((item, i) =>
        i === index ? { ...item, quantity: newQuantity } : item
      )
    );
  };

  const handleRemoveItem = (index: number) => {
    setSelectedFoodItems(selectedFoodItems.filter((_, i) => i !== index));
  };

  const validateForm = (): boolean => {
    const newErrors = {
      description: '',
      group: '',
      hotel: '',
      items: '',
      members: '',
      splits: '',
      paymentMethod: '',
    };

    let isValid = true;

    if (!description.trim()) {
      newErrors.description = 'Description is required';
      isValid = false;
    }

    if (!selectedGroupId) {
      newErrors.group = 'Please select a group';
      isValid = false;
    }

    if (!selectedHotelId) {
      newErrors.hotel = 'Please select a hotel/restaurant';
      isValid = false;
    }

    if (selectedFoodItems.length === 0) {
      newErrors.items = 'Please add at least one item';
      isValid = false;
    }

    if (selectedMembers.length === 0) {
      newErrors.members = 'Please select at least one member';
      isValid = false;
    }

    if (!selectedPaymentMethodId) {
      newErrors.paymentMethod = 'Please select a payment method';
      isValid = false;
    }

    // Validate custom splits
    if (splitType === 'unequal') {
      const totalAmount = calculateTotalAmount();
      const totalSplit = selectedMembers.reduce((sum, userId) => {
        const splitAmount = parseFloat(customSplits[userId] || '0');
        return sum + splitAmount;
      }, 0);

      if (Math.abs(totalSplit - totalAmount) > 0.01) {
        newErrors.splits = `Splits must equal total amount (₹${totalAmount.toFixed(2)}). Current: ₹${totalSplit.toFixed(2)}`;
        isValid = false;
      }
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    if (!isOnline) {
      showToast('Cannot create expense. No internet connection.', 'error');
      return;
    }

    setIsSubmitting(true);

    try {
      // Find food category
      const foodCategoryId = 'your-food-category-id'; // You'll need to fetch this from categories

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

      await foodExpenseService.createFoodExpense({
        group_id: selectedGroupId,
        category_id: foodCategoryId,
        description: description.trim(),
        paid_by: profile!.id,
        date: format(selectedDate, 'yyyy-MM-dd'),
        notes: notes.trim() || undefined,
        split_type: splitType,
        splits,
        hotel_id: selectedHotelId,
        food_items: selectedFoodItems,
        payment_method_id: selectedPaymentMethodId,
      });

      showToast('Food expense added successfully!', 'success');
      navigation.goBack();
    } catch (error: any) {
      console.error('Create food expense error:', error);
      showToast(error.message || 'Failed to create expense', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedGroup = groups.find(g => g.id === selectedGroupId);
  const selectedHotel = hotels.find(h => h.id === selectedHotelId);
  const totalAmount = calculateTotalAmount();

  // Filter menu items based on search
  const filteredMenuItems = selectedHotel?.menu_items?.filter(item =>
    item.item_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.category.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.content}>
        {/* Description */}
        <Text style={styles.sectionTitle}>What did you eat?</Text>
        <TextInput
          label="Description *"
          value={description}
          onChangeText={setDescription}
          mode="outlined"
          placeholder="e.g., Lunch at Monal"
          error={!!errors.description}
          style={styles.input}
        />
        {errors.description ? (
          <HelperText type="error">{errors.description}</HelperText>
        ) : null}

        <Divider style={styles.divider} />

        {/* Group Selection */}
        <Text style={styles.sectionTitle}>Which group?</Text>
        {groups.length === 0 ? (
          <Text style={styles.noDataText}>No groups available.</Text>
        ) : (
          <View style={styles.chipContainer}>
            {groups.map(group => (
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
          <HelperText type="error">{errors.group}</HelperText>
        ) : null}

        <Divider style={styles.divider} />

        {/* Hotel Selection */}
        <Text style={styles.sectionTitle}>Select Restaurant/Hotel *</Text>
        {hotels.length === 0 ? (
          <Text style={styles.noDataText}>Loading hotels...</Text>
        ) : (
          <View style={styles.chipContainer}>
            {hotels.map(hotel => (
              <Chip
                key={hotel.id}
                selected={selectedHotelId === hotel.id}
                onPress={() => setSelectedHotelId(hotel.id)}
                style={styles.chip}
                icon="store"
              >
                {hotel.name}
              </Chip>
            ))}
          </View>
        )}
        {errors.hotel ? (
          <HelperText type="error">{errors.hotel}</HelperText>
        ) : null}

        <Divider style={styles.divider} />

        {/* Food Items */}
        {selectedHotelId && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Food Items</Text>
              <View style={styles.addItemButtons}>
                <Button
                  mode="outlined"
                  icon="plus"
                  onPress={() => setMenuItemModalVisible(true)}
                  compact
                >
                  From Menu
                </Button>
                <Button
                  mode="outlined"
                  icon="pencil"
                  onPress={() => setManualItemModalVisible(true)}
                  compact
                >
                  Manual
                </Button>
              </View>
            </View>

            {selectedFoodItems.length === 0 ? (
              <Card style={styles.emptyItemsCard}>
                <Card.Content style={styles.emptyItemsContent}>
                  <Text style={styles.emptyItemsText}>No items added yet</Text>
                </Card.Content>
              </Card>
            ) : (
              selectedFoodItems.map((item, index) => (
                <Card key={index} style={styles.foodItemCard}>
                  <Card.Content style={styles.foodItemContent}>
                    <View style={styles.foodItemLeft}>
                      <Text style={styles.foodItemName}>{item.item_name}</Text>
                      <Text style={styles.foodItemPrice}>
                        ₹{item.unit_price} × {item.quantity} = ₹{(item.unit_price * item.quantity).toFixed(2)}
                      </Text>
                    </View>
                    <View style={styles.foodItemRight}>
                      <IconButton
                        icon="minus"
                        size={20}
                        onPress={() => handleUpdateQuantity(index, item.quantity - 1)}
                      />
                      <Text style={styles.quantityText}>{item.quantity}</Text>
                      <IconButton
                        icon="plus"
                        size={20}
                        onPress={() => handleUpdateQuantity(index, item.quantity + 1)}
                      />
                      <IconButton
                        icon="delete"
                        size={20}
                        iconColor="#F44336"
                        onPress={() => handleRemoveItem(index)}
                      />
                    </View>
                  </Card.Content>
                </Card>
              ))
            )}

            {selectedFoodItems.length > 0 && (
              <Card style={styles.totalCard}>
                <Card.Content>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total Amount:</Text>
                    <Text style={styles.totalAmount}>₹{totalAmount.toFixed(2)}</Text>
                  </View>
                </Card.Content>
              </Card>
            )}

            {errors.items ? (
              <HelperText type="error">{errors.items}</HelperText>
            ) : null}

            <Divider style={styles.divider} />
          </>
        )}

        {/* Payment Method */}
        <Text style={styles.sectionTitle}>Payment Method *</Text>
        {paymentMethods.length === 0 ? (
          <Button
            mode="outlined"
            icon="plus"
            onPress={() => navigation.navigate('AddPaymentMethod')}
          >
            Add Payment Method
          </Button>
        ) : (
          <View style={styles.chipContainer}>
            {paymentMethods.map(method => (
              <Chip
                key={method.id}
                selected={selectedPaymentMethodId === method.id}
                onPress={() => setSelectedPaymentMethodId(method.id)}
                style={styles.chip}
                icon={
                  method.method_type === 'cash' ? 'cash' :
                  method.method_type === 'bank' ? 'bank' :
                  method.method_type === 'card' ? 'credit-card' :
                  'wallet'
                }
              >
                {method.method_type === 'cash' ? 'Cash' :
                 method.method_type === 'bank' ? method.bank_name || 'Bank' :
                 method.method_type === 'card' ? `Card ${method.card_last_four || ''}` :
                 method.custom_name || method.method_type}
              </Chip>
            ))}
          </View>
        )}
        {errors.paymentMethod ? (
          <HelperText type="error">{errors.paymentMethod}</HelperText>
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
        {selectedGroup && totalAmount > 0 && (
          <>
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
              <HelperText type="error">{errors.members}</HelperText>
            ) : null}
            {errors.splits ? (
              <HelperText type="error">{errors.splits}</HelperText>
            ) : null}
          </>
        )}

        <Divider style={styles.divider} />

        {/* Notes */}
        <Text style={styles.sectionTitle}>Notes (Optional)</Text>
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

        {/* Submit Button */}
        <Button
          mode="contained"
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={isSubmitting || totalAmount === 0}
          style={styles.submitButton}
          contentStyle={styles.submitButtonContent}
        >
          Add Food Expense
        </Button>
      </ScrollView>

      {/* Menu Items Modal */}
      <Portal>
        <Modal
          visible={menuItemModalVisible}
          onDismiss={() => {
            setMenuItemModalVisible(false);
            setSearchQuery('');
          }}
          contentContainerStyle={styles.modalContent}
        >
          <Text style={styles.modalTitle}>Select from Menu</Text>
          
          <Searchbar
            placeholder="Search items..."
            onChangeText={setSearchQuery}
            value={searchQuery}
            style={styles.searchBar}
          />

          <ScrollView style={styles.menuItemsList}>
            {filteredMenuItems.length === 0 ? (
              <Text style={styles.noItemsText}>No items found</Text>
            ) : (
              filteredMenuItems.map(menuItem => (
                <List.Item
                  key={menuItem.id}
                  title={menuItem.item_name}
                  description={`${menuItem.category} • ₹${menuItem.price}`}
                  onPress={() => handleAddMenuItem(menuItem)}
                  right={props => <List.Icon {...props} icon="plus" />}
                />
              ))
            )}
          </ScrollView>
        </Modal>
      </Portal>

      {/* Manual Item Modal */}
      <Portal>
        <Modal
          visible={manualItemModalVisible}
          onDismiss={() => setManualItemModalVisible(false)}
          contentContainerStyle={styles.modalContent}
        >
          <Text style={styles.modalTitle}>Add Item Manually</Text>

          <TextInput
            label="Item Name *"
            value={manualItemName}
            onChangeText={setManualItemName}
            mode="outlined"
            style={styles.input}
            placeholder="e.g., Special Biryani"
          />

          <TextInput
            label="Price *"
            value={manualItemPrice}
            onChangeText={setManualItemPrice}
            mode="outlined"
            keyboardType="decimal-pad"
            left={<TextInput.Affix text="₹" />}
            style={styles.input}
            placeholder="0.00"
          />

          <TextInput
            label="Quantity *"
            value={manualItemQuantity}
            onChangeText={setManualItemQuantity}
            mode="outlined"
            keyboardType="number-pad"
            style={styles.input}
            placeholder="1"
          />

          <View style={styles.modalActions}>
            <Button
              mode="outlined"
              onPress={() => setManualItemModalVisible(false)}
              style={styles.modalButton}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleAddManualItem}
              style={styles.modalButton}
            >
              Add
            </Button>
          </View>
        </Modal>
      </Portal>

      <LoadingOverlay visible={isSubmitting} message="Creating food expense..." />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 12,
  },
  addItemButtons: {
    flexDirection: 'row',
    gap: 8,
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
  noDataText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  emptyItemsCard: {
    backgroundColor: '#fff',
  },
  emptyItemsContent: {
    alignItems: 'center',
    padding: 16,
  },
  emptyItemsText: {
    fontSize: 14,
    color: '#666',
  },
  foodItemCard: {
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  foodItemContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  foodItemLeft: {
    flex: 1,
  },
  foodItemName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  foodItemPrice: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  foodItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quantityText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    minWidth: 24,
    textAlign: 'center',
  },
  totalCard: {
    marginTop: 12,
    backgroundColor: '#E8DEF8',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#6200EE',
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
  submitButton: {
    marginTop: 24,
  },
  submitButtonContent: {
    paddingVertical: 8,
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 24,
    margin: 20,
    borderRadius: 8,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  searchBar: {
    marginBottom: 16,
  },
  menuItemsList: {
    maxHeight: 400,
  },
  noItemsText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 24,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  modalButton: {
    minWidth: 100,
  },
});