// src/screens/main/GroupsScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Text, Card, Avatar, Button, FAB, Searchbar, IconButton, Portal, Modal, TextInput, HelperText } from 'react-native-paper';
import { useGroups } from '../../hooks/useGroups';
import { useAuth } from '../../hooks/useAuth';
import { useAppDispatch } from '../../store';
import { fetchGroups, createGroup } from '../../store/slices/groupsSlice';
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
  const { groups, loading } = useGroups();
  const { profile } = useAuth();
  const dispatch = useAppDispatch();

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
    // Check if current user is a member of this group
    const isMember = group.members?.some((member: any) => member.user_id === profile?.id);
    return isMember;
  });

  // Filter groups based on search
  const filteredGroups = myGroups.filter(group =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderGroupCard = ({ item }: any) => {
    const memberCount = item.members?.length || 0;
    const isCreator = item.created_by === profile?.id;

    return (
     <Card
  style={styles.groupCard}
  onPress={() => {
    // This is the navigation call
    navigation.navigate('GroupDetails', { groupId: item.id });
  }}
>
        <Card.Content style={styles.cardContent}>
          <View style={styles.groupHeader}>
            <Avatar.Text 
              size={56} 
              label={item.name.substring(0, 2).toUpperCase()} 
              style={styles.groupAvatar}
            />
            <View style={styles.groupInfo}>
              <Text style={[styles.groupName, { color: theme.colors.onSurface }]}>{item.name}</Text>
              {item.description ? (
                <Text style={[styles.groupDescription, { color: theme.colors.onSurfaceVariant }]} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
              <View style={styles.groupMeta}>
                <IconButton icon="account-group" size={16} style={styles.metaIcon} />
                <Text style={[styles.metaText, { color: theme.colors.onSurfaceVariant }]}>{memberCount} members</Text>
                {isCreator && (
                  <>
                    <Text style={[styles.metaDivider, { color: theme.colors.onSurfaceVariant }]}>•</Text>
                    <Text style={styles.creatorBadge}>Admin</Text>
                  </>
                )}
              </View>
            </View>
            <IconButton icon="chevron-right" size={24} />
          </View>
        </Card.Content>
      </Card>
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
      {/* Search Bar */}
      <Searchbar
        placeholder="Search groups"
        onChangeText={setSearchQuery}
        value={searchQuery}
        style={styles.searchBar}
      />

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
  searchBar: {
    margin: 16,
    marginBottom: 8,
    elevation: 2,
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  groupCard: {
    marginBottom: 12,
    elevation: 2,
  },
  cardContent: {
    padding: 16,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupAvatar: {
    backgroundColor: '#6200EE',
  },
  groupInfo: {
    flex: 1,
    marginLeft: 16,
  },
  groupName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  groupDescription: {
    fontSize: 14,
    marginBottom: 8,
  },
  groupMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaIcon: {
    margin: 0,
    padding: 0,
  },
  metaText: {
    fontSize: 12,
    marginLeft: -4,
  },
  metaDivider: {
    fontSize: 12,
    marginHorizontal: 8,
  },
  creatorBadge: {
    fontSize: 11,
    color: '#6200EE',
    fontWeight: '600',
    backgroundColor: '#E8DEF8',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
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
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
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