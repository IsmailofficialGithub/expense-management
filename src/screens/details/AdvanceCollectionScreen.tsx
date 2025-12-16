// src/screens/details/AdvanceCollectionScreen.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  RefreshControl,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  TextInput,
  RadioButton,
  Divider,
  useTheme,
  ActivityIndicator,
  Chip,
  Avatar,
  IconButton,
  Portal,
  Modal,
} from 'react-native-paper';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  fetchAdvanceCollections,
  createAdvanceCollection,
  contributeToCollection,
  approveContribution,
  rejectContribution,
} from '../../store/slices/bulkPaymentsSlice';
import { useAuth } from '../../hooks/useAuth';
import { useGroups } from '../../hooks/useGroups';
import { useToast } from '../../hooks/useToast';
import { ErrorHandler } from '../../utils/errorHandler';
import { paymentMethodService } from '../../services/supabase.service';
import { usePersonalFinance } from '../../hooks/usePersonalFinance';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import LoadingOverlay from '../../components/LoadingOverlay';
import { format } from 'date-fns';

type Props = NativeStackScreenProps<RootStackParamList, 'AdvanceCollection'>;

export default function AdvanceCollectionScreen({ navigation, route }: Props) {
  const { groupId } = route.params;
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { profile } = useAuth();
  const { selectedGroup } = useGroups();
  const { showToast } = useToast();
  const { completeBalance } = usePersonalFinance();
  const { advanceCollections, loading } = useAppSelector(
    state => state.bulkPayments
  );

  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [page, setPage] = useState(1);
  const [expandedCollections, setExpandedCollections] = useState<string[]>([]);

  // Existing state...
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [amountType, setAmountType] = useState<'total' | 'per_member'>('per_member');
  const [totalAmount, setTotalAmount] = useState('');
  const [perMemberAmount, setPerMemberAmount] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState<string>('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPaymentMethodModal, setShowPaymentMethodModal] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null);
  const [pendingContributionId, setPendingContributionId] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);

  useEffect(() => {
    loadCollections();
    loadPaymentMethods();
  }, [groupId, profile?.id, statusFilter, page]); // Reload when filters change

  const loadPaymentMethods = async () => {
    if (!profile?.id) return;
    try {
      const methods = await paymentMethodService.getPaymentMethods(profile.id);
      setPaymentMethods(methods);
      // Auto-select default payment method if available
      const defaultMethod = methods.find(m => m.is_default);
      if (defaultMethod) {
        setSelectedPaymentMethod(defaultMethod.id);
      }
    } catch (error) {
      console.error('Error loading payment methods:', error);
    }
  };

  const loadCollections = async () => {
    try {
      await dispatch(fetchAdvanceCollections({
        groupId,
        status: statusFilter,
        page,
        limit: 20 // Default limit
      })).unwrap();
    } catch (error) {
      ErrorHandler.handleError(error, showToast, 'Load Collections');
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedCollections(prev =>
      prev.includes(id) ? prev.filter(cId => cId !== id) : [...prev, id]
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setPage(1);
    // Force fetch page 1 even if state hasn't updated yet or was already 1
    try {
      await dispatch(fetchAdvanceCollections({
        groupId,
        status: statusFilter,
        page: 1,
        limit: 20
      })).unwrap();
    } catch (error) {
      ErrorHandler.handleError(error, showToast, 'Refresh Collections');
    }
    setRefreshing(false);
  };

  const handleCreateCollection = async () => {
    if (!selectedRecipient) {
      showToast('Please select a recipient', 'error');
      return;
    }

    if (amountType === 'total' && !totalAmount) {
      showToast('Please enter total amount', 'error');
      return;
    }

    if (amountType === 'per_member' && !perMemberAmount) {
      showToast('Please enter amount per member', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await dispatch(
        createAdvanceCollection({
          group_id: groupId,
          recipient_id: selectedRecipient,
          total_amount: amountType === 'total' ? parseFloat(totalAmount) : undefined,
          per_member_amount: amountType === 'per_member' ? parseFloat(perMemberAmount) : undefined,
          description: description.trim() || undefined,
        })
      ).unwrap();

      showToast('Advance collection created successfully!', 'success');
      setShowCreateForm(false);
      setTotalAmount('');
      setPerMemberAmount('');
      setSelectedRecipient('');
      setDescription('');
      await loadCollections();
    } catch (error) {
      ErrorHandler.handleError(error, showToast, 'Create Collection');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContribute = async (contributionId: string) => {
    // Get contribution amount
    const collection = advanceCollections.find(c =>
      c.contributions?.some(contrib => contrib.id === contributionId)
    );
    const contribution = collection?.contributions?.find(c => c.id === contributionId);
    const amount = contribution?.amount || 0;

    // Check if user has sufficient balance
    const hasBalance = completeBalance && completeBalance.net_balance >= amount;
    const hasPaymentMethods = paymentMethods.length > 0;

    // If no balance and no payment methods, show error
    if (!hasBalance && !hasPaymentMethods) {
      showToast('No payment method available. Please add a payment method first.', 'error');
      return;
    }

    // If no balance but has payment methods, show selection modal
    if (!hasBalance && hasPaymentMethods) {
      setPendingContributionId(contributionId);
      setShowPaymentMethodModal(true);
      return;
    }

    // If has balance or no payment method needed, proceed directly
    proceedWithContribution(contributionId);
  };

  const proceedWithContribution = async (contributionId: string) => {
    Alert.alert(
      'Confirm Contribution',
      'Have you paid your contribution? It will be marked as paid.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, I Paid',
          onPress: async () => {
            try {
              await dispatch(contributeToCollection({ contributionId })).unwrap();
              showToast('Contribution marked as paid!', 'success');
              await loadCollections();
            } catch (error) {
              ErrorHandler.handleError(error, showToast, 'Contribute');
            }
          },
        },
      ]
    );
  };

  const handlePaymentMethodSelected = async () => {
    if (!pendingContributionId || !selectedPaymentMethod) {
      showToast('Please select a payment method', 'error');
      return;
    }

    setShowPaymentMethodModal(false);
    // Proceed with contribution using selected payment method
    await proceedWithContribution(pendingContributionId);
    setPendingContributionId(null);
  };

  const handleApprove = async (contributionId: string) => {
    Alert.alert(
      'Approve Contribution',
      'Are you sure you want to approve this contribution?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            try {
              await dispatch(approveContribution(contributionId)).unwrap();
              showToast('Contribution approved!', 'success');
              await loadCollections();
            } catch (error) {
              ErrorHandler.handleError(error, showToast, 'Approve');
            }
          },
        },
      ]
    );
  };

  const handleReject = async (contributionId: string) => {
    Alert.prompt(
      'Reject Contribution',
      'Please provide a reason for rejection (optional):',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          onPress: async (reason?: string) => {
            try {
              await dispatch(rejectContribution({ contributionId, reason: reason || undefined })).unwrap();
              showToast('Contribution rejected.', 'info');
              await loadCollections();
            } catch (error) {
              ErrorHandler.handleError(error, showToast, 'Reject');
            }
          },
        },
      ],
      'plain-text'
    );
  };

  const collectionsToDisplay = advanceCollections; // Now we display what's in store, filtered by API
  // const activeCollections = advanceCollections.filter(c => c.status === 'active');
  // const completedCollections = advanceCollections.filter(c => c.status === 'completed');

  const groupMembers = selectedGroup?.members || [];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        {/* <Text style={[styles.title, { color: theme.colors.onSurface }]}>
          Advance Collections
        </Text> */}
        <Button
          mode="contained"
          onPress={() => setShowCreateForm(!showCreateForm)}
          icon={showCreateForm ? 'close' : 'plus'}
        >
          {showCreateForm ? 'Cancel' : 'New'}
        </Button>
      </View>

      {showCreateForm && (
        <Card style={styles.createCard}>
          <Card.Content>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
              Create Advance Collection
            </Text>

            <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
              Select Recipient
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.memberList}>
              {groupMembers.map(member => (
                <Chip
                  key={member.user_id}
                  selected={selectedRecipient === member.user_id}
                  onPress={() => setSelectedRecipient(member.user_id)}
                  style={styles.memberChip}
                  avatar={
                    <Avatar.Text
                      size={24}
                      label={member.user?.full_name?.substring(0, 2).toUpperCase() || 'U'}
                    />
                  }
                >
                  {member.user?.full_name || 'Unknown'}
                </Chip>
              ))}
            </ScrollView>

            <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
              Amount Type
            </Text>
            <RadioButton.Group
              onValueChange={(value) => setAmountType(value as 'total' | 'per_member')}
              value={amountType}
            >
              <RadioButton.Item label="Per Member" value="per_member" />
              <RadioButton.Item label="Total Amount" value="total" />
            </RadioButton.Group>

            {amountType === 'per_member' ? (
              <TextInput
                label="Amount per Member (₹)"
                value={perMemberAmount}
                onChangeText={setPerMemberAmount}
                keyboardType="numeric"
                mode="outlined"
                style={styles.input}
              />
            ) : (
              <TextInput
                label="Total Amount (₹)"
                value={totalAmount}
                onChangeText={setTotalAmount}
                keyboardType="numeric"
                mode="outlined"
                style={styles.input}
              />
            )}

            <TextInput
              label="Description (Optional)"
              value={description}
              onChangeText={setDescription}
              mode="outlined"
              multiline
              numberOfLines={3}
              style={styles.input}
            />

            <Button
              mode="contained"
              onPress={handleCreateCollection}
              loading={isSubmitting}
              disabled={isSubmitting}
              style={styles.submitButton}
            >
              Create Collection
            </Button>
          </Card.Content>
        </Card>
      )}

      {/* Filters */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Chip
            selected={statusFilter === 'all'}
            onPress={() => setStatusFilter('all')}
            style={styles.filterChip}
            showSelectedOverlay
          >
            All
          </Chip>
          <Chip
            selected={statusFilter === 'active'}
            onPress={() => setStatusFilter('active')}
            style={styles.filterChip}
            showSelectedOverlay
          >
            Active
          </Chip>
          <Chip
            selected={statusFilter === 'completed'}
            onPress={() => setStatusFilter('completed')}
            style={styles.filterChip}
            showSelectedOverlay
          >
            Completed
          </Chip>
        </ScrollView>
      </View>

      {collectionsToDisplay.length > 0 ? (
        <View style={styles.section}>
          {collectionsToDisplay.map(collection => {
            const myContribution = collection.contributions?.find(
              c => c.user_id === profile?.id
            );
            const isRecipient = collection.recipient_id === profile?.id;
            const paidCount = collection.contributions?.filter(c => c.status === 'paid').length || 0;
            const pendingApprovalCount = collection.contributions?.filter(c => c.status === 'pending_approval').length || 0;
            const totalCount = collection.contributions?.length || 0;
            const isExpanded = expandedCollections.includes(collection.id);
            const collectedAmount = collection.contributions?.reduce((sum, c) => c.status === 'paid' ? sum + Number(c.amount) : sum, 0) || 0;

            return (
              <Card key={collection.id} style={styles.collectionCard}>
                <Card.Content>
                  {/* Header Row */}
                  <View style={styles.cardHeader}>
                    <View style={styles.headerLeft}>
                      <Text style={[styles.collectionTitle, { color: theme.colors.onSurface }]}>
                        {collection.description || 'Advance Collection'}
                      </Text>
                      <Text style={[styles.dateText, { color: theme.colors.onSurfaceVariant }]}>
                        {format(new Date(collection.created_at), 'MMM dd, yyyy')}
                      </Text>
                    </View>
                    <Chip
                      mode="flat"
                      style={{ backgroundColor: collection.status === 'active' ? '#E8F5E9' : '#EEEEEE' }}
                      textStyle={{ color: collection.status === 'active' ? '#2E7D32' : '#757575', fontSize: 12 }}
                    >
                      {collection.status === 'active' ? 'Active' : 'Completed'}
                    </Chip>
                  </View>

                  <Divider style={styles.divider} />

                  {/* Stats Grid */}
                  <View style={styles.statsGrid}>
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>Total</Text>
                      <Text style={[styles.statValue, { color: theme.colors.primary }]}>
                        ₹{collection.total_amount.toFixed(0)}
                      </Text>
                    </View>
                    <View style={styles.statLine} />
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>Collected</Text>
                      <Text style={[styles.statValue, { color: '#4CAF50' }]}>
                        ₹{collectedAmount.toFixed(0)}
                      </Text>
                    </View>
                    <View style={styles.statLine} />
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>Per Person</Text>
                      <Text style={styles.statValue}>
                        ₹{collection.per_member_amount?.toFixed(0)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.recipientRow}>
                    <Text style={[styles.recipientLabel, { color: theme.colors.onSurfaceVariant }]}>Recipient: </Text>
                    <Avatar.Text size={24} label={collection.recipient?.full_name?.substring(0, 2).toUpperCase() || 'U'} />
                    <Text style={[styles.recipientName, { color: theme.colors.onSurface }]}>
                      {collection.recipient?.full_name || 'Unknown'}
                    </Text>
                  </View>

                  {myContribution?.status === 'pending' && (
                    <Button
                      mode="contained"
                      onPress={() => handleContribute(myContribution.id)}
                      style={styles.mainActionButton}
                    >
                      Pay My Share (₹{myContribution.amount.toFixed(0)})
                    </Button>
                  )}

                  {myContribution?.status === 'pending_approval' && (
                    <View style={styles.pendingApprovalNotice}>
                      <Text style={[styles.pendingApprovalText, { color: '#FF9800' }]}>
                        ⏳ Waiting for approval
                      </Text>
                    </View>
                  )}

                  <Button
                    mode="text"
                    onPress={() => toggleExpand(collection.id)}
                    style={styles.expandButton}
                    icon={isExpanded ? "chevron-up" : "chevron-down"}
                  >
                    {isExpanded ? "Hide Details" : `View Contributors (${paidCount}/${totalCount} Paid)`}
                  </Button>

                  {isExpanded && (
                    <View style={styles.contributorsSection}>
                      <Text style={[styles.contributorsTitle, { color: theme.colors.onSurface }]}>
                        Contributors Status
                      </Text>
                      {collection.contributions?.map(contribution => (
                        <View key={contribution.id} style={styles.contributorContainer}>
                          <View style={styles.contributorRow}>
                            <Avatar.Text
                              size={32}
                              label={contribution.user?.full_name?.substring(0, 2).toUpperCase() || 'U'}
                            />
                            <View style={styles.contributorInfo}>
                              <Text style={[styles.contributorName, { color: theme.colors.onSurface }]}>
                                {contribution.user?.full_name || 'Unknown'}
                                {contribution.user_id === profile?.id && ' (You)'}
                              </Text>
                              <Text style={[styles.contributorAmount, { color: theme.colors.onSurfaceVariant }]}>
                                ₹{contribution.amount.toFixed(2)}
                              </Text>
                            </View>
                            <Chip
                              icon={
                                contribution.status === 'paid'
                                  ? 'check-circle'
                                  : contribution.status === 'pending_approval'
                                    ? 'clock-alert-outline'
                                    : 'clock-outline'
                              }
                              style={[
                                styles.statusChip,
                                contribution.status === 'paid' && { backgroundColor: theme.colors.primaryContainer },
                                contribution.status === 'pending_approval' && { backgroundColor: '#FFF3E0' }
                              ]}
                              textStyle={
                                contribution.status === 'pending_approval' ? { color: '#FF9800' } : undefined
                              }
                            >
                              {contribution.status === 'paid'
                                ? 'Paid'
                                : contribution.status === 'pending_approval'
                                  ? 'Pending Approval'
                                  : 'Pending'}
                            </Chip>
                          </View>
                          {/* We handled main "Pay" button outside, but keep context actions here if needed or if viewed by admin */}
                          {isRecipient && contribution.status === 'pending_approval' && (
                            <View style={styles.approvalButtons}>
                              <Button
                                mode="contained"
                                compact
                                buttonColor="#4CAF50"
                                onPress={() => handleApprove(contribution.id)}
                                style={styles.approveButton}
                              >
                                Approve
                              </Button>
                              <Button
                                mode="outlined"
                                compact
                                textColor="#F44336"
                                onPress={() => handleReject(contribution.id)}
                                style={styles.rejectButton}
                              >
                                Reject
                              </Button>
                            </View>
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </Card.Content>
              </Card>
            );
          })}
        </View>
      ) : (
        !loading && (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
              No {statusFilter !== 'all' ? statusFilter : ''} collections found
            </Text>
          </View>
        )
      )}

      {advanceCollections.length > 0 && advanceCollections.length >= 20 && (
        <Button
          mode="outlined"
          onPress={() => setPage(p => p + 1)}
          loading={loading && !refreshing}
          disabled={loading}
          style={{ margin: 16 }}
        >
          Load More
        </Button>
      )}

      {advanceCollections.length === 0 && !loading && (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
            No {statusFilter !== 'all' ? statusFilter : ''} advance collections yet
          </Text>
          <Text style={[styles.emptySubtext, { color: theme.colors.onSurfaceVariant }]}>
            Create a collection to collect money in advance from group members
          </Text>
        </View>
      )}

      <LoadingOverlay visible={loading && !refreshing} message="Loading collections..." />

      {/* Payment Method Selection Modal */}
      <Portal>
        <Modal
          visible={showPaymentMethodModal}
          onDismiss={() => {
            setShowPaymentMethodModal(false);
            setPendingContributionId(null);
          }}
          contentContainerStyle={[styles.modalContent, { backgroundColor: theme.colors.surface }]}
        >
          <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>
            Select Payment Method
          </Text>
          <Text style={[styles.modalSubtitle, { color: theme.colors.onSurfaceVariant }]}>
            Your account balance is insufficient. Please select a payment method:
          </Text>

          {paymentMethods.map(method => (
            <Card
              key={method.id}
              style={[
                styles.paymentMethodCard,
                selectedPaymentMethod === method.id && { borderColor: theme.colors.primary, borderWidth: 2 }
              ]}
              onPress={() => setSelectedPaymentMethod(method.id)}
            >
              <Card.Content style={styles.paymentMethodContent}>
                <View style={styles.paymentMethodInfo}>
                  <Text style={[styles.paymentMethodName, { color: theme.colors.onSurface }]}>
                    {method.name}
                  </Text>
                  <Text style={[styles.paymentMethodType, { color: theme.colors.onSurfaceVariant }]}>
                    {method.type}
                  </Text>
                </View>
                {method.is_default && (
                  <Chip icon="star" style={styles.defaultChip}>Default</Chip>
                )}
              </Card.Content>
            </Card>
          ))}

          <View style={styles.modalActions}>
            <Button
              mode="outlined"
              onPress={() => {
                setShowPaymentMethodModal(false);
                setPendingContributionId(null);
              }}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handlePaymentMethodSelected}
              disabled={!selectedPaymentMethod}
            >
              Continue
            </Button>
          </View>
        </Modal>
      </Portal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  createCard: {
    marginBottom: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    marginTop: 12,
    marginBottom: 4,
  },
  memberList: {
    marginVertical: 8,
  },
  memberChip: {
    marginRight: 8,
  },
  input: {
    marginBottom: 12,
  },
  submitButton: {
    marginTop: 16,
  },
  // New Styles
  filterContainer: {
    marginBottom: 16,
  },
  filterChip: {
    marginRight: 8,
  },
  collectionCard: {
    marginBottom: 16,
    borderRadius: 12,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  headerLeft: {
    flex: 1,
    marginRight: 8,
  },
  dateText: {
    fontSize: 12,
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 12,
    backgroundColor: '#FAFAFA',
    padding: 12,
    borderRadius: 8,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statLine: {
    width: 1,
    backgroundColor: '#E0E0E0',
  },
  statLabel: {
    fontSize: 11,
    color: '#757575',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  recipientLabel: {
    fontSize: 14,
    marginRight: 8,
  },
  recipientName: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 8,
  },
  expandButton: {
    marginTop: 8,
    borderColor: '#E0E0E0',
  },
  contributorsSection: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    paddingTop: 16,
  },
  mainActionButton: {
    marginVertical: 8,
    borderRadius: 8,
  },
  // End new styles
  collectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  collectionInfo: {
    flex: 1,
  },
  collectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  collectionAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  collectionRecipient: {
    fontSize: 14,
    marginBottom: 4,
  },
  collectionProgress: {
    fontSize: 12,
  },
  divider: {
    marginVertical: 12,
  },
  contributorsTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  contributorContainer: {
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 12,
  },
  contributorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contributorInfo: {
    flex: 1,
    marginLeft: 12,
  },
  contributorName: {
    fontSize: 14,
    fontWeight: '500',
  },
  contributorAmount: {
    fontSize: 12,
  },
  statusChip: {
    marginRight: 8,
  },
  contributeButton: {
    marginTop: 12,
  },
  completedDate: {
    fontSize: 12,
    marginTop: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  approvalButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  approveButton: {
    flex: 1,
  },
  rejectButton: {
    flex: 1,
  },
  pendingApprovalNotice: {
    backgroundColor: '#FFF3E0',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  pendingApprovalText: {
    fontSize: 14,
    textAlign: 'center',
  },
  modalContent: {
    padding: 20,
    margin: 20,
    borderRadius: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 16,
  },
  paymentMethodCard: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  paymentMethodContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentMethodInfo: {
    flex: 1,
  },
  paymentMethodName: {
    fontSize: 16,
    fontWeight: '600',
  },
  paymentMethodType: {
    fontSize: 12,
    marginTop: 4,
  },
  defaultChip: {
    backgroundColor: '#E3F2FD',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
});

