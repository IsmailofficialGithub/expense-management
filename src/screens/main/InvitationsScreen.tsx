// src/screens/main/InvitationsScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, RefreshControl } from 'react-native';
import { Text, Card, Button, Avatar, Divider, useTheme } from 'react-native-paper';
import { useAuth } from '../../hooks/useAuth';
import { invitationService } from '../../services/supabase.service';
import { GroupInvitationWithDetails } from '../../types/database.types';
import { useToast } from '../../hooks/useToast';
import { ErrorHandler } from '../../utils/errorHandler';
import { useNetworkCheck } from '../../hooks/useNetworkCheck';
import LoadingOverlay from '../../components/LoadingOverlay';
import SafeScrollView from '../../components/SafeScrollView';
import { format } from 'date-fns';

export default function InvitationsScreen({ navigation }: any) {
  const theme = useTheme();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const { isOnline } = useNetworkCheck({ showToast: true });
  const [invitations, setInvitations] = useState<GroupInvitationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadInvitations();
  }, []);

  const loadInvitations = async () => {
    if (!isOnline) {
      showToast('Unable to load invitations. No internet connection.', 'error');
      setLoading(false);
      return;
    }

    try {
      const data = await invitationService.getPendingInvitations();
      setInvitations(data);
    } catch (error) {
      ErrorHandler.handleError(error, showToast, 'Load Invitations');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInvitations();
  };

  const handleAccept = async (invitation: GroupInvitationWithDetails) => {
    if (!isOnline) {
      showToast('No internet connection.', 'error');
      return;
    }

    setProcessingIds(prev => new Set(prev).add(invitation.id));

    try {
      await invitationService.acceptInvitation(invitation.id);
      showToast(`You've joined "${invitation.group.name}"!`, 'success');
      
      // Remove from list
      setInvitations(prev => prev.filter(inv => inv.id !== invitation.id));
      
      // Navigate to group details
      navigation.navigate('GroupDetails', { groupId: invitation.group_id });
    } catch (error: any) {
      ErrorHandler.handleError(error, showToast, 'Accept Invitation');
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(invitation.id);
        return newSet;
      });
    }
  };

  const handleReject = async (invitation: GroupInvitationWithDetails) => {
    if (!isOnline) {
      showToast('No internet connection.', 'error');
      return;
    }

    setProcessingIds(prev => new Set(prev).add(invitation.id));

    try {
      await invitationService.rejectInvitation(invitation.id);
      showToast('Invitation declined', 'info');
      
      // Remove from list
      setInvitations(prev => prev.filter(inv => inv.id !== invitation.id));
    } catch (error: any) {
      ErrorHandler.handleError(error, showToast, 'Reject Invitation');
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(invitation.id);
        return newSet;
      });
    }
  };

  if (loading) {
    return <LoadingOverlay visible={true} message="Loading invitations..." />;
  }

  return (
    <SafeScrollView
      hasTabBar={true}
      hasHeader={true}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>
            Group Invitations
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
            {invitations.length === 0 
              ? 'No pending invitations' 
              : `${invitations.length} invitation${invitations.length > 1 ? 's' : ''} pending`}
          </Text>
        </View>

        {invitations.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Card.Content style={styles.emptyContent}>
              <Avatar.Icon size={64} icon="email-outline" style={styles.emptyIcon} />
              <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
                No pending invitations
              </Text>
              <Text style={[styles.emptySubtext, { color: theme.colors.onSurfaceVariant }]}>
                When someone invites you to a group, it will appear here
              </Text>
            </Card.Content>
          </Card>
        ) : (
          invitations.map((invitation) => {
            const isProcessing = processingIds.has(invitation.id);
            // Inviter name - we can enhance this later with a join query
            const inviterName = 'Someone';

            return (
              <Card key={invitation.id} style={styles.invitationCard}>
                <Card.Content>
                  <View style={styles.invitationHeader}>
                    <Avatar.Text
                      size={48}
                      label={invitation.group.name.substring(0, 2).toUpperCase()}
                      style={styles.groupAvatar}
                    />
                    <View style={styles.invitationInfo}>
                      <Text style={[styles.groupName, { color: theme.colors.onSurface }]}>
                        {invitation.group.name}
                      </Text>
                      <Text style={[styles.inviterText, { color: theme.colors.onSurfaceVariant }]}>
                        Invited by {inviterName}
                      </Text>
                      <Text style={[styles.dateText, { color: theme.colors.onSurfaceVariant }]}>
                        {format(new Date(invitation.created_at), "MMM dd, yyyy")}
                      </Text>
                    </View>
                  </View>

                  <Divider style={styles.divider} />

                  <View style={styles.actions}>
                    <Button
                      mode="outlined"
                      onPress={() => handleReject(invitation)}
                      disabled={isProcessing}
                      style={styles.rejectButton}
                    >
                      Decline
                    </Button>
                    <Button
                      mode="contained"
                      onPress={() => handleAccept(invitation)}
                      disabled={isProcessing}
                      loading={isProcessing}
                      style={styles.acceptButton}
                    >
                      Accept
                    </Button>
                  </View>
                </Card.Content>
              </Card>
            );
          })
        )}
      </View>
    </SafeScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
  },
  emptyCard: {
    marginTop: 32,
  },
  emptyContent: {
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  invitationCard: {
    marginBottom: 16,
  },
  invitationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  groupAvatar: {
    marginRight: 12,
  },
  invitationInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  inviterText: {
    fontSize: 14,
    marginBottom: 4,
  },
  dateText: {
    fontSize: 12,
  },
  divider: {
    marginVertical: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  rejectButton: {
    flex: 1,
  },
  acceptButton: {
    flex: 1,
  },
});

