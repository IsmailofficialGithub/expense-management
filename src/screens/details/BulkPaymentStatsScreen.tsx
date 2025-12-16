// src/screens/details/BulkPaymentStatsScreen.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  useTheme,
  ActivityIndicator,
  Chip,
  Divider,
} from 'react-native-paper';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  fetchBulkPaymentStats,
  fetchAdvanceCollections,
} from '../../store/slices/bulkPaymentsSlice';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { ErrorHandler } from '../../utils/errorHandler';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import LoadingOverlay from '../../components/LoadingOverlay';
import { format } from 'date-fns';

type Props = NativeStackScreenProps<RootStackParamList, 'BulkPaymentStats'>;

export default function BulkPaymentStatsScreen({ navigation, route }: Props) {
  const { groupId } = route.params;
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const { bulkPaymentStats, advanceCollections, loading } = useAppSelector(
    state => state.bulkPayments
  );

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, [groupId]);

  const loadData = async () => {
    try {
      await Promise.all([
        dispatch(fetchBulkPaymentStats(groupId)).unwrap(),
        dispatch(fetchAdvanceCollections(groupId)).unwrap(),
      ]);
    } catch (error) {
      ErrorHandler.handleError(error, showToast, 'Load Stats');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const activeCollections = advanceCollections.filter(c => c.status === 'active');
  const completedCollections = advanceCollections.filter(c => c.status === 'completed');
  const pendingApprovalCollections = advanceCollections.filter(c => {
    return c.contributions?.some(contrib => 
      contrib.status === 'pending_approval' && 
      c.recipient_id === profile?.id
    );
  });

  if (loading && !bulkPaymentStats) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingOverlay visible={true} message="Loading statistics..." />
      </View>
    );
  }

  const stats = bulkPaymentStats || {
    activeCount: 0,
    totalCount: 0,
    completedCount: 0,
    pendingCount: 0,
    totalAmount: 0,
    pendingAmount: 0,
    activeAmount: 0,
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>
          Bulk Payment Statistics
        </Text>
      </View>

      {/* Statistics Cards */}
      <View style={styles.statsGrid}>
        <Card style={styles.statCard}>
          <Card.Content>
            <Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>
              Active Collections
            </Text>
            <Text style={[styles.statValue, { color: theme.colors.primary }]}>
              {stats.activeCount}
            </Text>
            <Text style={[styles.statAmount, { color: theme.colors.onSurface }]}>
              ₹{stats.activeAmount.toFixed(2)}
            </Text>
          </Card.Content>
        </Card>

        <Card style={styles.statCard}>
          <Card.Content>
            <Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>
              Total Collections
            </Text>
            <Text style={[styles.statValue, { color: theme.colors.onSurface }]}>
              {stats.totalCount}
            </Text>
            <Text style={[styles.statAmount, { color: theme.colors.onSurface }]}>
              ₹{stats.totalAmount.toFixed(2)}
            </Text>
          </Card.Content>
        </Card>

        <Card style={styles.statCard}>
          <Card.Content>
            <Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>
              Completed
            </Text>
            <Text style={[styles.statValue, { color: '#4CAF50' }]}>
              {stats.completedCount}
            </Text>
          </Card.Content>
        </Card>

        <Card style={styles.statCard}>
          <Card.Content>
            <Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>
              Pending Contributions
            </Text>
            <Text style={[styles.statValue, { color: '#FF9800' }]}>
              {stats.pendingCount}
            </Text>
            <Text style={[styles.statAmount, { color: theme.colors.onSurface }]}>
              ₹{stats.pendingAmount.toFixed(2)}
            </Text>
          </Card.Content>
        </Card>
      </View>

      {/* Pending Approvals Section */}
      {pendingApprovalCollections.length > 0 && (
        <Card style={styles.sectionCard}>
          <Card.Content>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
              Pending Your Approval
            </Text>
            {pendingApprovalCollections.map(collection => {
              const pendingContribs = collection.contributions?.filter(
                c => c.status === 'pending_approval'
              ) || [];
              return (
                <View key={collection.id} style={styles.pendingItem}>
                  <Text style={[styles.collectionName, { color: theme.colors.onSurface }]}>
                    Collection for {collection.recipient?.full_name || 'Recipient'}
                  </Text>
                  <Text style={[styles.pendingText, { color: '#FF9800' }]}>
                    {pendingContribs.length} contribution(s) waiting approval
                  </Text>
                  <Button
                    mode="outlined"
                    compact
                    onPress={() => navigation.navigate('AdvanceCollection', { groupId })}
                    style={styles.viewButton}
                  >
                    View & Approve
                  </Button>
                </View>
              );
            })}
          </Card.Content>
        </Card>
      )}

      {/* Active Collections */}
      {activeCollections.length > 0 && (
        <Card style={styles.sectionCard}>
          <Card.Content>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
              Active Collections
            </Text>
            {activeCollections.map(collection => {
              const paidCount = collection.contributions?.filter(c => c.status === 'paid').length || 0;
              const totalCount = collection.contributions?.length || 0;
              const progress = totalCount > 0 ? (paidCount / totalCount) * 100 : 0;

              return (
                <View key={collection.id} style={styles.collectionItem}>
                  <View style={styles.collectionHeader}>
                    <Text style={[styles.collectionName, { color: theme.colors.onSurface }]}>
                      {collection.recipient?.full_name || 'Recipient'}
                    </Text>
                    <Chip
                      icon="clock-outline"
                      style={styles.activeChip}
                      textStyle={{ fontSize: 12 }}
                    >
                      Active
                    </Chip>
                  </View>
                  <Text style={[styles.collectionAmount, { color: theme.colors.onSurface }]}>
                    ₹{collection.per_member_amount?.toFixed(2) || '0.00'} per member
                  </Text>
                  <Text style={[styles.progressText, { color: theme.colors.onSurfaceVariant }]}>
                    {paidCount} of {totalCount} paid ({progress.toFixed(0)}%)
                  </Text>
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${progress}%`, backgroundColor: theme.colors.primary },
                      ]}
                    />
                  </View>
                  <Button
                    mode="text"
                    compact
                    onPress={() => navigation.navigate('AdvanceCollection', { groupId })}
                  >
                    View Details
                  </Button>
                  <Divider style={styles.divider} />
                </View>
              );
            })}
          </Card.Content>
        </Card>
      )}

      {/* Completed Collections */}
      {completedCollections.length > 0 && (
        <Card style={styles.sectionCard}>
          <Card.Content>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
              Completed Collections
            </Text>
            {completedCollections.slice(0, 5).map(collection => (
              <View key={collection.id} style={styles.collectionItem}>
                <View style={styles.collectionHeader}>
                  <Text style={[styles.collectionName, { color: theme.colors.onSurface }]}>
                    {collection.recipient?.full_name || 'Recipient'}
                  </Text>
                  <Chip
                    icon="check-circle"
                    style={styles.completedChip}
                    textStyle={{ fontSize: 12 }}
                  >
                    Completed
                  </Chip>
                </View>
                <Text style={[styles.collectionAmount, { color: theme.colors.onSurface }]}>
                  ₹{collection.total_amount?.toFixed(2) || '0.00'} total
                </Text>
                {collection.completed_at && (
                  <Text style={[styles.dateText, { color: theme.colors.onSurfaceVariant }]}>
                    Completed on {format(new Date(collection.completed_at), 'MMM dd, yyyy')}
                  </Text>
                )}
                <Divider style={styles.divider} />
              </View>
            ))}
            {completedCollections.length > 5 && (
              <Text style={[styles.moreText, { color: theme.colors.onSurfaceVariant }]}>
                +{completedCollections.length - 5} more completed collections
              </Text>
            )}
          </Card.Content>
        </Card>
      )}

      <View style={styles.footer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
  },
  statCard: {
    width: '48%',
    margin: '1%',
  },
  statLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statAmount: {
    fontSize: 14,
  },
  sectionCard: {
    margin: 16,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  pendingItem: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  collectionItem: {
    marginBottom: 16,
    paddingBottom: 16,
  },
  collectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  collectionName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  collectionAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  progressText: {
    fontSize: 12,
    marginBottom: 8,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#e0e0e0',
    borderRadius: 3,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  activeChip: {
    backgroundColor: '#E3F2FD',
  },
  completedChip: {
    backgroundColor: '#E8F5E9',
  },
  pendingText: {
    fontSize: 14,
    marginBottom: 8,
  },
  viewButton: {
    alignSelf: 'flex-start',
  },
  dateText: {
    fontSize: 12,
    marginTop: 4,
  },
  divider: {
    marginTop: 16,
  },
  moreText: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  footer: {
    height: 20,
  },
});
