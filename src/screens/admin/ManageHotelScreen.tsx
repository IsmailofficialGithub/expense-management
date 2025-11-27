// src/screens/admin/ManageHotelScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Alert } from 'react-native';
import { Text, Card, FAB, IconButton, Portal, Modal, TextInput, Button, HelperText, Divider, List, Chip, useTheme } from 'react-native-paper';
import { useHotels } from '../../hooks/useHotels';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useNetworkCheck } from '../../hooks/useNetworkCheck';
import { useAppDispatch } from '../../store';
import { fetchHotels, createHotel, createMenuItem, updateMenuItem, deleteMenuItem } from '../../store/slices/hotelsSlice';
import LoadingOverlay from '../../components/LoadingOverlay';
import { HotelMenuItem } from '../../types/database.types';

export default function ManageHotelScreen({ navigation }: any) {
  const theme = useTheme();
  const { hotels, loading } = useHotels();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const { isOnline } = useNetworkCheck();
  const dispatch = useAppDispatch();

  const [refreshing, setRefreshing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Hotel Modal
  const [hotelModalVisible, setHotelModalVisible] = useState(false);
  const [hotelName, setHotelName] = useState('');
  const [hotelLocation, setHotelLocation] = useState('');
  const [hotelPhone, setHotelPhone] = useState('');
  const [hotelErrors, setHotelErrors] = useState({ name: '' });

  // Menu Item Modal
  const [menuItemModalVisible, setMenuItemModalVisible] = useState(false);
  const [selectedHotelId, setSelectedHotelId] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [editingMenuItem, setEditingMenuItem] = useState<HotelMenuItem | null>(null);
  const [menuItemErrors, setMenuItemErrors] = useState({
    name: '',
    category: '',
    price: '',
  });

  // Expanded hotels (accordion)
  const [expandedHotels, setExpandedHotels] = useState<string[]>([]);

  useEffect(() => {
    loadHotels();
  }, []);

  const loadHotels = async () => {
    if (!isOnline) {
      showToast('Unable to load hotels. No internet connection.', 'error');
      return;
    }

    try {
      await dispatch(fetchHotels()).unwrap();
    } catch (error: any) {
      console.error('Load hotels error:', error);
      showToast('Failed to load hotels', 'error');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadHotels();
    setRefreshing(false);
  };

  const toggleHotelExpanded = (hotelId: string) => {
    if (expandedHotels.includes(hotelId)) {
      setExpandedHotels(expandedHotels.filter(id => id !== hotelId));
    } else {
      setExpandedHotels([...expandedHotels, hotelId]);
    }
  };

  const handleOpenHotelModal = () => {
    setHotelName('');
    setHotelLocation('');
    setHotelPhone('');
    setHotelErrors({ name: '' });
    setHotelModalVisible(true);
  };

  const handleOpenMenuItemModal = (hotelId: string, menuItem?: HotelMenuItem) => {
    setSelectedHotelId(hotelId);

    if (menuItem) {
      // Editing existing item
      setEditingMenuItem(menuItem);
      setItemName(menuItem.item_name);
      setItemCategory(menuItem.category);
      setItemPrice(menuItem.price.toString());
      setItemDescription(menuItem.description || '');
    } else {
      // Adding new item
      setEditingMenuItem(null);
      setItemName('');
      setItemCategory('');
      setItemPrice('');
      setItemDescription('');
    }

    setMenuItemErrors({ name: '', category: '', price: '' });
    setMenuItemModalVisible(true);
  };

  const handleCreateHotel = async () => {
    setHotelErrors({ name: '' });

    if (!hotelName.trim()) {
      setHotelErrors({ name: 'Hotel name is required' });
      return;
    }

    if (!isOnline) {
      showToast('Cannot create hotel. No internet connection.', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      await dispatch(createHotel({
        name: hotelName.trim(),
        location: hotelLocation.trim() || undefined,
        phone: hotelPhone.trim() || undefined,
      })).unwrap();

      showToast('Hotel added successfully!', 'success');
      setHotelModalVisible(false);
    } catch (error: any) {
      console.error('Create hotel error:', error);
      showToast(error.message || 'Failed to create hotel', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveMenuItem = async () => {
    const newErrors = { name: '', category: '', price: '' };
    let isValid = true;

    if (!itemName.trim()) {
      newErrors.name = 'Item name is required';
      isValid = false;
    }

    if (!itemCategory.trim()) {
      newErrors.category = 'Category is required';
      isValid = false;
    }

    const price = parseFloat(itemPrice);
    if (!itemPrice || isNaN(price) || price <= 0) {
      newErrors.price = 'Please enter valid price';
      isValid = false;
    }

    setMenuItemErrors(newErrors);
    if (!isValid) return;

    if (!isOnline) {
      showToast('Cannot save menu item. No internet connection.', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      if (editingMenuItem) {
        // Update existing item
        await dispatch(updateMenuItem({
          itemId: editingMenuItem.id,
          updates: {
            item_name: itemName.trim(),
            category: itemCategory.trim(),
            price: parseFloat(itemPrice),
            description: itemDescription.trim() || undefined,
          },
        })).unwrap();
        showToast('Menu item updated!', 'success');
      } else {
        // Create new item
        await dispatch(createMenuItem({
          hotel_id: selectedHotelId,
          item_name: itemName.trim(),
          category: itemCategory.trim(),
          price: parseFloat(itemPrice),
          description: itemDescription.trim() || undefined,
        })).unwrap();
        showToast('Menu item added!', 'success');
      }

      setMenuItemModalVisible(false);
    } catch (error: any) {
      console.error('Save menu item error:', error);
      showToast(error.message || 'Failed to save menu item', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteMenuItem = (itemId: string, itemName: string) => {
    Alert.alert(
      'Delete Menu Item',
      `Are you sure you want to delete "${itemName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!isOnline) {
              showToast('Cannot delete item. No internet connection.', 'error');
              return;
            }

            setIsProcessing(true);
            try {
              await dispatch(deleteMenuItem(itemId)).unwrap();
              showToast('Menu item deleted', 'success');
            } catch (error: any) {
              console.error('Delete menu item error:', error);
              showToast('Failed to delete menu item', 'error');
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <IconButton icon="store-outline" size={64} iconColor="#6200EE" />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>No Hotels Yet</Text>
      <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
        Add hotels or restaurants to manage their menu items for food expenses
      </Text>
      <Button
        mode="contained"
        icon="plus"
        onPress={handleOpenHotelModal}
        style={styles.emptyButton}
      >
        Add Your First Hotel
      </Button>
    </View>
  );

  // Group menu items by category
  const groupMenuItemsByCategory = (menuItems: HotelMenuItem[]) => {
    const grouped: { [category: string]: HotelMenuItem[] } = {};

    menuItems.forEach(item => {
      if (!grouped[item.category]) {
        grouped[item.category] = [];
      }
      grouped[item.category].push(item);
    });

    return grouped;
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Info Card */}
        <Card style={styles.infoCard} mode="contained">
          <Card.Content style={styles.infoContent}>
            <IconButton icon="information" size={20} iconColor="#6200EE" style={styles.infoIcon} />
            <Text style={styles.infoText}>
              Manage hotels, restaurants, and their menu items. These will be available when creating food expenses.
            </Text>
          </Card.Content>
        </Card>

        {hotels.length === 0 ? (
          renderEmptyState()
        ) : (
          hotels.map((hotel) => {
            const isExpanded = expandedHotels.includes(hotel.id);
            const isCreatedByMe = hotel.created_by === profile?.id;
            const groupedItems = groupMenuItemsByCategory(hotel.menu_items || []);

            return (
              <Card key={hotel.id} style={styles.hotelCard} mode="elevated">
                <Card.Content>
                  {/* Hotel Header */}
                  <View style={styles.hotelHeader}>
                    <View style={styles.hotelTitleRow}>
                      <View style={styles.hotelIconContainer}>
                        <IconButton icon="store" size={24} iconColor="#fff" style={styles.hotelIcon} />
                      </View>
                      <View style={styles.hotelInfo}>
                        <Text style={[styles.hotelName, { color: theme.colors.onSurface }]}>{hotel.name}</Text>
                        <View style={styles.hotelMetaRow}>
                          {hotel.location && (
                            <View style={styles.metaItem}>
                              <IconButton icon="map-marker" size={14} iconColor="#666" style={styles.metaIcon} />
                              <Text style={[styles.hotelLocation, { color: theme.colors.onSurfaceVariant }]}>{hotel.location}</Text>
                            </View>
                          )}
                          {hotel.phone && (
                            <View style={styles.metaItem}>
                              <IconButton icon="phone" size={14} iconColor="#666" style={styles.metaIcon} />
                              <Text style={[styles.hotelPhone, { color: theme.colors.onSurfaceVariant }]}>{hotel.phone}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                    <IconButton
                      icon={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={24}
                      onPress={() => toggleHotelExpanded(hotel.id)}
                      iconColor={theme.colors.primary}
                    />
                  </View>

                  {/* Chips Row */}
                  <View style={styles.chipsRow}>
                    <Chip
                      icon="food"
                      style={styles.menuCountChip}
                      textStyle={styles.chipText}
                      compact
                    >
                      {hotel.menu_items?.length || 0} items
                    </Chip>
                    {isCreatedByMe && (
                      <Chip
                        icon="crown"
                        style={styles.ownerChip}
                        textStyle={styles.ownerChipText}
                        compact
                      >
                        Your Hotel
                      </Chip>
                    )}
                  </View>

                  {/* Expanded Menu Items */}
                  {isExpanded && (
                    <>
                      <Divider style={styles.divider} />

                      {/* Add Item Button */}
                      {isCreatedByMe && (
                        <Button
                          mode="contained-tonal"
                          icon="plus"
                          onPress={() => handleOpenMenuItemModal(hotel.id)}
                          style={styles.addMenuItemButton}
                          compact
                        >
                          Add Menu Item
                        </Button>
                      )}

                      {/* Menu Items by Category */}
                      {Object.entries(groupedItems).length === 0 ? (
                        <View style={styles.noItemsContainer}>
                          <IconButton icon="food-off" size={32} iconColor="#ccc" />
                          <Text style={[styles.noItemsText, { color: theme.colors.onSurfaceVariant }]}>
                            No menu items yet
                          </Text>
                        </View>
                      ) : (
                        Object.entries(groupedItems).map(([category, items]) => (
                          <View key={category} style={styles.categorySection}>
                            <View style={styles.categoryHeader}>
                              <IconButton icon="food-variant" size={16} iconColor="#6200EE" style={styles.categoryIcon} />
                              <Text style={styles.categoryTitle}>{category}</Text>
                              <View style={styles.categoryBadge}>
                                <Text style={styles.categoryBadgeText}>{items.length}</Text>
                              </View>
                            </View>
                            {items.map((item, index) => (
                              <View
                                key={item.id}
                                style={[
                                  styles.menuItem,
                                  index === items.length - 1 && styles.menuItemLast
                                ]}
                              >
                                <View style={styles.menuItemInfo}>
                                  <Text style={[styles.menuItemName, { color: theme.colors.onSurface }]}>
                                    {item.item_name}
                                  </Text>
                                  {item.description && (
                                    <Text style={[styles.menuItemDescription, { color: theme.colors.onSurfaceVariant }]}>
                                      {item.description}
                                    </Text>
                                  )}
                                  <View style={styles.priceContainer}>
                                    <Text style={styles.menuItemPrice}>₹{item.price}</Text>
                                  </View>
                                </View>
                                {isCreatedByMe && (
                                  <View style={styles.menuItemActions}>
                                    <IconButton
                                      icon="pencil-outline"
                                      size={18}
                                      iconColor="#6200EE"
                                      onPress={() => handleOpenMenuItemModal(hotel.id, item)}
                                      style={styles.actionButton}
                                    />
                                    <IconButton
                                      icon="delete-outline"
                                      size={18}
                                      iconColor="#F44336"
                                      onPress={() => handleDeleteMenuItem(item.id, item.item_name)}
                                      style={styles.actionButton}
                                    />
                                  </View>
                                )}
                              </View>
                            ))}
                          </View>
                        ))
                      )}
                    </>
                  )}
                </Card.Content>
              </Card>
            );
          })
        )}
      </ScrollView>

      {/* Floating Action Button */}
      <FAB
        icon="plus"
        label="Add Hotel"
        style={styles.fab}
        onPress={handleOpenHotelModal}
      />

      {/* Add Hotel Modal */}
      <Portal>
        <Modal
          visible={hotelModalVisible}
          onDismiss={() => setHotelModalVisible(false)}
          contentContainerStyle={[styles.modalContent, { backgroundColor: theme.colors.surface }]}
        >
          <View style={styles.modalHeader}>
            <IconButton icon="store" size={28} iconColor="#6200EE" style={styles.modalIcon} />
            <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>Add Hotel/Restaurant</Text>
          </View>

          <TextInput
            label="Hotel Name *"
            value={hotelName}
            onChangeText={setHotelName}
            mode="outlined"
            error={!!hotelErrors.name}
            style={styles.input}
            placeholder="e.g., Monal Restaurant"
          />
          {hotelErrors.name ? (
            <HelperText type="error">{hotelErrors.name}</HelperText>
          ) : null}

          <TextInput
            label="Location (Optional)"
            value={hotelLocation}
            onChangeText={setHotelLocation}
            mode="outlined"
            style={styles.input}
            placeholder="e.g., F-7 Markaz, Islamabad"
            left={<TextInput.Icon icon="map-marker" />}
          />

          <TextInput
            label="Phone Number (Optional)"
            value={hotelPhone}
            onChangeText={setHotelPhone}
            mode="outlined"
            keyboardType="phone-pad"
            style={styles.input}
            placeholder="051-1234567"
            left={<TextInput.Icon icon="phone" />}
          />

          <View style={styles.modalActions}>
            <Button
              mode="outlined"
              onPress={() => setHotelModalVisible(false)}
              style={styles.modalButton}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleCreateHotel}
              style={styles.modalButton}
              loading={isProcessing}
              disabled={isProcessing}
            >
              Add Hotel
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* Add/Edit Menu Item Modal */}
      <Portal>
        <Modal
          visible={menuItemModalVisible}
          onDismiss={() => setMenuItemModalVisible(false)}
          contentContainerStyle={[styles.modalContent, { backgroundColor: theme.colors.surface }]}
        >
          <View style={styles.modalHeader}>
            <IconButton icon="food" size={28} iconColor="#6200EE" style={styles.modalIcon} />
            <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>
              {editingMenuItem ? 'Edit Menu Item' : 'Add Menu Item'}
            </Text>
          </View>

          <TextInput
            label="Item Name *"
            value={itemName}
            onChangeText={setItemName}
            mode="outlined"
            error={!!menuItemErrors.name}
            style={styles.input}
            placeholder="e.g., Chicken Biryani"
          />
          {menuItemErrors.name ? (
            <HelperText type="error">{menuItemErrors.name}</HelperText>
          ) : null}

          <TextInput
            label="Category *"
            value={itemCategory}
            onChangeText={setItemCategory}
            mode="outlined"
            error={!!menuItemErrors.category}
            style={styles.input}
            placeholder="e.g., Main Course, Beverages, Desserts"
            left={<TextInput.Icon icon="tag" />}
          />
          {menuItemErrors.category ? (
            <HelperText type="error">{menuItemErrors.category}</HelperText>
          ) : null}

          <TextInput
            label="Price *"
            value={itemPrice}
            onChangeText={setItemPrice}
            mode="outlined"
            keyboardType="decimal-pad"
            error={!!menuItemErrors.price}
            left={<TextInput.Affix text="₹" />}
            style={styles.input}
            placeholder="0.00"
          />
          {menuItemErrors.price ? (
            <HelperText type="error">{menuItemErrors.price}</HelperText>
          ) : null}

          <TextInput
            label="Description (Optional)"
            value={itemDescription}
            onChangeText={setItemDescription}
            mode="outlined"
            multiline
            numberOfLines={2}
            style={styles.input}
            placeholder="Additional details about the item"
          />

          <View style={styles.modalActions}>
            <Button
              mode="outlined"
              onPress={() => setMenuItemModalVisible(false)}
              style={styles.modalButton}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleSaveMenuItem}
              style={styles.modalButton}
              loading={isProcessing}
              disabled={isProcessing}
            >
              {editingMenuItem ? 'Update' : 'Add'}
            </Button>
          </View>
        </Modal>
      </Portal>

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
    paddingBottom: 100,
  },
  infoCard: {
    marginBottom: 16,
    backgroundColor: '#F3E5F5',
    elevation: 0,
  },
  infoContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoIcon: {
    margin: 0,
    marginRight: 4,
  },
  infoText: {
    fontSize: 13,
    color: '#333',
    lineHeight: 18,
    flex: 1,
  },
  hotelCard: {
    marginBottom: 12,
    elevation: 2,
  },
  hotelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  hotelTitleRow: {
    flexDirection: 'row',
    flex: 1,
    alignItems: 'flex-start',
  },
  hotelIconContainer: {
    backgroundColor: '#6200EE',
    borderRadius: 8,
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  hotelIcon: {
    margin: 0,
  },
  hotelInfo: {
    flex: 1,
  },
  hotelName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  hotelMetaRow: {
    flexDirection: 'column',
    gap: 2,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: -8,
  },
  metaIcon: {
    margin: 0,
    padding: 0,
  },
  hotelLocation: {
    fontSize: 12,
    marginLeft: -4,
  },
  hotelPhone: {
    fontSize: 12,
    marginLeft: -4,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginLeft: 60,
  },
  menuCountChip: {
    height: 28,
    backgroundColor: '#E8DEF8',
  },
  chipText: {
    fontSize: 11,
    color: '#6200EE',
    fontWeight: '600',
  },
  ownerChip: {
    height: 28,
    backgroundColor: '#FFE082',
  },
  ownerChipText: {
    fontSize: 11,
    color: '#F57C00',
    fontWeight: '600',
  },
  divider: {
    marginVertical: 16,
  },
  addMenuItemButton: {
    marginBottom: 16,
  },
  categorySection: {
    marginBottom: 16,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#F3E5F5',
    padding: 8,
    borderRadius: 8,
  },
  categoryIcon: {
    margin: 0,
    marginRight: 4,
  },
  categoryTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#6200EE',
    textTransform: 'uppercase',
    flex: 1,
    letterSpacing: 0.5,
  },
  categoryBadge: {
    backgroundColor: '#6200EE',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  categoryBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemInfo: {
    flex: 1,
    paddingRight: 8,
  },
  menuItemName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  menuItemDescription: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 6,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuItemPrice: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  menuItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    margin: 0,
  },
  noItemsContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  noItemsText: {
    fontSize: 13,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F3E5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  emptyButton: {
    paddingHorizontal: 16,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: '#6200EE',
  },
  modalContent: {
    padding: 24,
    margin: 20,
    borderRadius: 12,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalIcon: {
    margin: 0,
    marginRight: 8,
    backgroundColor: '#F3E5F5',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  input: {
    marginBottom: 8,
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