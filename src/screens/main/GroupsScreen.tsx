// src/screens/main/GroupsScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { Text, Avatar, Button, FAB, Searchbar, IconButton, Portal, Modal, TextInput, HelperText } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useGroups } from '../../hooks/useGroups';
import { useAuth } from '../../hooks/useAuth';
import { useAppDispatch } from '../../store';
import { fetchGroups, createGroup, fetchGroupBalances } from '../../store/slices/groupsSlice';
import { ErrorHandler } from '../../utils/errorHandler';
import { useToast } from '../../hooks/useToast';
import { useNetworkCheck } from '../../hooks/useNetworkCheck';
import { useTheme } from 'react-native-paper';
import ErrorState from '../../components/ErrorState';

export default function GroupsScreen({ navigation }: any) {
  const theme = useTheme();
  const { showToast } = useToast();
  const { isOnline } = useNetworkCheck({
    showToast: true,
    onOnline: () => loadGroups(),
  });
  const { groups, loading, balances } = useGroups();
  const { profile, user } = useAuth();
  const dispatch = useAppDispatch();

  // Use profile ID or fallback to user ID
  const currentUserId = profile?.id || user?.id;

  // Load balances for all groups
  useEffect(() => {
    if (groups.length > 0 && isOnline && currentUserId) {
      groups.forEach((group: any) => {
        dispatch(fetchGroupBalances(group.id));
      });
    }
  }, [groups.length, isOnline, currentUserId]);

  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [errors, setErrors] = useState({ name: '' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    setError(null);
    try {
      await dispatch(fetchGroups()).unwrap();
    } catch (error: any) {
      const errorMessage = ErrorHandler.getUserFriendlyMessage(error);
      setError(errorMessage);
      ErrorHandler.handleError(error, showToast, 'Load Groups');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadGroups();
    } catch (error) {
      // Error already handled in loadGroups
    } finally {
      setRefreshing(false);
    }
  };

  const handleCreateGroup = async () => {
    // Validation
    setErrors({ name: '' });
    if (!newGroupName.trim()) {
      setErrors({ name: 'Group name is required' });
      return;
    }

    setCreating(true);
    try {
      await dispatch(createGroup({
        name: newGroupName.trim(),
        description: newGroupDescription.trim() || undefined,
        member_ids: [],
      })).unwrap();

      // Reset form and close modal
      setNewGroupName('');
      setNewGroupDescription('');
      setModalVisible(false);

      // Show different message based on online status
      if (isOnline) {
        showToast('Group created successfully!', 'success');
      } else {
        showToast('Group saved offline. Will sync when connection is restored.', 'info');
      }

    } catch (error) {
      ErrorHandler.handleError(error, showToast, 'Create Group');
    } finally {
      setCreating(false);
    }
  };

  // Filter groups: only show groups where current user is a member
  const myGroups = groups.filter(group => {
    // If we don't know the current user, show nothing (or show all?)
    // Better to show nothing for privacy
    if (!currentUserId) return false;

    // Check if current user is a member of this group
    const isMember = group.members?.some((member: any) => member.user_id === currentUserId);
    return isMember;
  });

  // Filter groups based on search
  const filteredGroups = myGroups.filter(group =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Gradient color schemes for cards
  const gradientColors = [
    ['#8B5CF6', '#EC4899'], // Purple to Pink
    ['#3B82F6', '#60A5FA'], // Blue gradient
    ['#14B8A6', '#10B981'], // Teal to Green
    ['#F59E0B', '#EF4444'], // Orange to Red
    ['#6366F1', '#8B5CF6'], // Indigo to Purple
    ['#EC4899', '#F472B6'], // Pink gradient
  ];

  // Format currency
  const formatCurrency = (amount: number) => {
    const absAmount = Math.abs(amount);
    if (absAmount >= 1000) {
      return `PKR ${amount >= 0 ? '+' : '-'}${absAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `PKR ${amount >= 0 ? '+' : '-'}${absAmount.toFixed(2)}`;
  };

  const renderGroupCard = ({ item, index }: any) => {
    const memberCount = item.members?.length || 0;
    const gradientIndex = index % gradientColors.length;
    const gradient = gradientColors[gradientIndex] as [string, string];

    // Get user's balance for this group
    const userBalance = balances.find((b: any) => b.group_id === item.id && b.user_id === currentUserId);
    const balance = userBalance?.balance ?? 0;

    // Get first 5 members for avatars
    const displayMembers = item.members?.slice(0, 5) || [];

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => navigation.navigate('GroupDetails', { groupId: item.id })}
        style={styles.cardContainer}
      >
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradientCard}
        >
          <View style={styles.cardContent}>
            {/* Header: Group Name and Balance */}
            <View style={styles.cardHeader}>
              <Text style={styles.groupName}>{item.name}</Text>
              <Text style={[styles.balanceAmount, balance < 0 && styles.negativeBalance]}>
                {formatCurrency(balance)}
              </Text>
            </View>

            {/* Members Section */}
            <View style={styles.membersSection}>
              <View style={styles.memberInfo}>
                <IconButton 
                  icon="account-group" 
                  size={16} 
                  iconColor="#FFFFFF" 
                  style={styles.memberIcon}
                />
                <Text style={styles.memberCount}>{memberCount} Members</Text>
              </View>

              {/* Member Avatars */}
              <View style={styles.avatarsContainer}>
                {displayMembers.map((member: any, idx: number) => {
                  const userName = member.user?.full_name || 'Unknown';
                  const initials = userName.substring(0, 2).toUpperCase();
                  const avatarUrl = member.user?.avatar_url;
                  
                  return (
                    <View 
                      key={member.id || idx} 
                      style={[
                        styles.avatarWrapper,
                        idx > 0 && styles.avatarOverlap
                      ]}
                    >
                      {avatarUrl ? (
                        <Avatar.Image 
                          size={40} 
                          source={{ uri: avatarUrl }} 
                          style={styles.memberAvatar}
                        />
                      ) : (
                        <Avatar.Text 
                          size={40} 
                          label={initials} 
                          style={styles.memberAvatar}
                          labelStyle={styles.avatarLabel}
                        />
                      )}
                    </View>
                  );
                })}
              </View>
            </View>

            {/* View Details Button */}
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={styles.viewDetailsButton}
                onPress={() => navigation.navigate('GroupDetails', { groupId: item.id })}
              >
                <Text style={[styles.viewDetailsText, { color: gradient[0] }]}>
                  View Details
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <IconButton icon="account-group-outline" size={80} iconColor={theme.colors.onSurfaceDisabled} />
      <Text style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>No Groups Yet</Text>
      <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
        Create a group to start tracking expenses with your flatmates
      </Text>
      <Button
        mode="contained"
        icon="plus"
        onPress={() => setModalVisible(true)}
        style={styles.emptyButton}
      >
        Create Your First Group
      </Button>
    </View>
  );

  // Show error state if there's an error and no groups
  if (error && myGroups.length === 0 && !loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null);
            loadGroups();
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>

      {/* Search Bar (Optional - can be hidden) */}
      {filteredGroups.length > 3 && (
        <Searchbar
          placeholder="Search groups"
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
        />
      )}

      {/* Groups List */}
      <FlatList
        data={filteredGroups}
        renderItem={renderGroupCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Floating Action Button */}
      {myGroups.length > 0 && (
        <FAB
          icon="plus"
          style={styles.fab}
          onPress={() => setModalVisible(true)}
          label="New Group"
        />
      )}

      {/* Create Group Modal */}
      <Portal>
        <Modal
          visible={modalVisible}
          onDismiss={() => setModalVisible(false)}
          contentContainerStyle={[styles.modalContent, { backgroundColor: theme.colors.surface }]}
        >
          <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>Create New Group</Text>

          <TextInput
            label="Group Name *"
            value={newGroupName}
            onChangeText={setNewGroupName}
            mode="outlined"
            error={!!errors.name}
            style={styles.input}
            placeholder="e.g., Flatmates, Trip to Murree"
          />
          {errors.name ? (
            <HelperText type="error" visible={!!errors.name}>
              {errors.name}
            </HelperText>
          ) : null}

          <TextInput
            label="Description (Optional)"
            value={newGroupDescription}
            onChangeText={setNewGroupDescription}
            mode="outlined"
            multiline
            numberOfLines={3}
            style={styles.input}
            placeholder="What's this group for?"
          />

          <View style={styles.modalActions}>
            <Button
              mode="outlined"
              onPress={() => setModalVisible(false)}
              style={styles.modalButton}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleCreateGroup}
              style={styles.modalButton}
              loading={creating}
              disabled={creating}
            >
              Create
            </Button>
          </View>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  searchBar: {
    margin: 16,
    marginBottom: 8,
    elevation: 2,
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  cardContainer: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  gradientCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardContent: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  groupName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    flex: 1,
    marginRight: 12,
  },
  balanceAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  negativeBalance: {
    color: '#FFEBEE',
  },
  membersSection: {
    marginBottom: 12,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  memberIcon: {
    margin: 0,
    padding: 0,
    width: 20,
    height: 20,
  },
  memberCount: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
    marginLeft: 3,
  },
  avatarsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrapper: {
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: '#FFFFFF',
  },
  avatarOverlap: {
    marginLeft: -12,
  },
  memberAvatar: {
    backgroundColor: '#E0E0E0',
  },
  avatarLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#424242',
  },
  buttonContainer: {
    alignItems: 'flex-end',
    marginTop: 4,
  },
  viewDetailsButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 120,
    alignItems: 'center',
  },
  viewDetailsText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
    color: '#1A1A1A',
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    color: '#666666',
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
    borderRadius: 8,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
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