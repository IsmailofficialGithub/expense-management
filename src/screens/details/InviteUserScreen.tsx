// src/screens/details/InviteUserScreen.tsx
import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, StatusBar, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { Text, TextInput, Button, Card, IconButton, Chip, HelperText, useTheme, Divider } from 'react-native-paper';
import { useToast } from '../../hooks/useToast';
import { useNetworkCheck } from '../../hooks/useNetworkCheck';
import { invitationService } from '../../services/supabase.service';
import LoadingOverlay from '../../components/LoadingOverlay';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  navigation: any;
  route: {
    params: {
      groupId: string;
      groupName: string;
    };
  };
}

export default function InviteUserScreen({ navigation, route }: Props) {
  const { groupId, groupName } = route.params;
  const theme = useTheme();
  const { showToast } = useToast();
  const { isOnline } = useNetworkCheck();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [invitedEmails, setInvitedEmails] = useState<string[]>([]);
  const [errors, setErrors] = useState({ email: '' });
  const [isInviting, setIsInviting] = useState(false);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleAddEmail = () => {
    setErrors({ email: '' });

    if (!email.trim()) {
      setErrors({ email: 'Email is required' });
      return;
    }

    if (!validateEmail(email)) {
      setErrors({ email: 'Invalid email format' });
      return;
    }

    if (invitedEmails.includes(email.toLowerCase())) {
      setErrors({ email: 'Email already added' });
      return;
    }

    setInvitedEmails([...invitedEmails, email.toLowerCase()]);
    setEmail('');
    Keyboard.dismiss();
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    setInvitedEmails(invitedEmails.filter(e => e !== emailToRemove));
  };

  const handleSendInvitations = async () => {
    if (invitedEmails.length === 0) {
      showToast('Please add at least one email', 'error');
      return;
    }

    if (!isOnline) {
      showToast('Cannot send invitations. No internet connection.', 'error');
      return;
    }

    Keyboard.dismiss();
    setIsInviting(true);

    let successCount = 0;
    let failCount = 0;

    for (const invitedEmail of invitedEmails) {
      try {
        await invitationService.inviteUser({
          group_id: groupId,
          invited_email: invitedEmail,
        });
        successCount++;
      } catch (error: any) {
        failCount++;
        console.error(`Failed to invite ${invitedEmail}:`, error.message);

        // Show specific error for this email
        if (error.message.includes('already exists') || error.message.includes('already a member')) {
          showToast(`${invitedEmail} is already a member`, 'warning');
        } else if (error.message.includes('already sent')) {
          showToast(`Invitation already sent to ${invitedEmail}`, 'warning');
        } else {
          showToast(`Failed to invite ${invitedEmail}: ${error.message}`, 'error');
        }
      }
    }

    setIsInviting(false);

    if (successCount > 0) {
      showToast(
        `Successfully invited ${successCount} user${successCount > 1 ? 's' : ''}!`,
        'success'
      );

      if (failCount === 0) {
        navigation.goBack();
      } else {
        setInvitedEmails([]);
      }
    }

    if (failCount > 0 && successCount === 0) {
      showToast(
        `Failed to invite ${failCount} user${failCount > 1 ? 's' : ''}. Please try again.`,
        'error'
      );
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.primary} translucent={false} />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Group Info */}
            <Card style={[styles.groupCard, { borderLeftColor: theme.colors.primary, backgroundColor: theme.colors.surface }]} elevation={1}>
              <Card.Content style={styles.groupCardContent}>
                <View style={[styles.groupIconContainer, { backgroundColor: theme.colors.primaryContainer }]}>
                  <IconButton
                    icon="account-group"
                    size={24}
                    iconColor={theme.colors.primary}
                    style={styles.groupIcon}
                  />
                </View>
                <View style={styles.groupTextContainer}>
                  <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>Inviting to group</Text>
                  <Text style={[styles.groupName, { color: theme.colors.onSurface }]}>{groupName}</Text>
                </View>
              </Card.Content>
            </Card>

            {/* Email Input Section */}
            <Card style={[styles.inputCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
              <Card.Content>
                <View style={styles.sectionHeader}>
                  <IconButton
                    icon="email-plus"
                    size={20}
                    iconColor={theme.colors.primary}
                    style={styles.sectionIcon}
                  />
                  <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Add Email Addresses</Text>
                </View>

                <Divider style={[styles.divider, { backgroundColor: theme.colors.outlineVariant }]} />

                <View style={styles.inputRow}>
                  <TextInput
                    label="Email Address *"
                    value={email}
                    onChangeText={setEmail}
                    mode="outlined"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    error={!!errors.email}
                    style={[styles.emailInput, { backgroundColor: theme.colors.surface }]}
                    placeholder="user@example.com"
                    onSubmitEditing={handleAddEmail}
                    returnKeyType="done"
                    blurOnSubmit={false}
                    theme={{ colors: { primary: theme.colors.primary } }}
                  />
                  <IconButton
                    icon="plus-circle"
                    size={28}
                    iconColor={email.trim() ? theme.colors.primary : theme.colors.surfaceDisabled}
                    onPress={handleAddEmail}
                    style={styles.addButton}
                    disabled={!email.trim()}
                  />
                </View>
                {errors.email ? (
                  <HelperText type="error" visible={!!errors.email} style={styles.errorText}>
                    {errors.email}
                  </HelperText>
                ) : null}
              </Card.Content>
            </Card>

            {/* Invited Emails List */}
            {invitedEmails.length > 0 && (
              <Card style={[styles.emailsListCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
                <Card.Content>
                  <View style={styles.sectionHeader}>
                    <IconButton
                      icon="email-check"
                      size={20}
                      iconColor={theme.colors.primary}
                      style={styles.sectionIcon}
                    />
                    <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                      Emails to Invite
                    </Text>
                    <View style={[styles.countBadge, { backgroundColor: theme.colors.primary }]}>
                      <Text style={[styles.countBadgeText, { color: theme.colors.onPrimary }]}>{invitedEmails.length}</Text>
                    </View>
                  </View>

                  <Divider style={[styles.divider, { backgroundColor: theme.colors.outlineVariant }]} />

                  <View style={styles.emailsList}>
                    {invitedEmails.map((invitedEmail, index) => (
                      <Chip
                        key={invitedEmail}
                        mode="outlined"
                        onClose={() => handleRemoveEmail(invitedEmail)}
                        style={[styles.emailChip, {
                          backgroundColor: theme.colors.primaryContainer,
                          borderColor: theme.colors.primary
                        }]}
                        closeIcon="close-circle"
                        textStyle={[styles.chipText, { color: theme.colors.onPrimaryContainer }]}
                      >
                        {invitedEmail}
                      </Chip>
                    ))}
                  </View>
                </Card.Content>
              </Card>
            )}

            {/* Send Button */}
            <Button
              mode="contained"
              onPress={handleSendInvitations}
              disabled={invitedEmails.length === 0 || isInviting}
              loading={isInviting}
              style={styles.sendButton}
              contentStyle={styles.sendButtonContent}
              icon="send"
              labelStyle={styles.sendButtonLabel}
              buttonColor={theme.colors.primary}
            >
              {invitedEmails.length > 0
                ? `Send ${invitedEmails.length} Invitation${invitedEmails.length > 1 ? 's' : ''}`
                : 'Send Invitations'
              }
            </Button>

            {/* Bottom spacing for keyboard */}
            <View style={styles.bottomSpacer} />
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      <LoadingOverlay visible={isInviting} message="Sending invitations..." />
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
    paddingTop: 20,
    flexGrow: 1,
  },

  // Group Card Styles
  groupCard: {
    marginBottom: 20, // backgroundColor: '#fff',
    borderRadius: 12,
    borderLeftWidth: 4,
  },
  groupCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  groupIconContainer: {
    borderRadius: 8,
    marginRight: 12,
  },
  groupIcon: {
    margin: 0,
  },
  groupTextContainer: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  groupName: {
    fontSize: 18,
    fontWeight: '700',
  },

  // Input Card Styles
  inputCard: {
    marginBottom: 20,
    borderRadius: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionIcon: {
    margin: 0,
    marginRight: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  divider: {
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emailInput: {
    flex: 1,
  },
  addButton: {
    margin: 0,
    marginTop: 6,
  },
  errorText: {
    marginTop: 4,
    marginLeft: 0,
  },

  // Emails List Card Styles
  emailsListCard: {
    marginBottom: 20,
    borderRadius: 12,
  },
  countBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emailsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  emailChip: {
    borderWidth: 1.5,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Send Button Styles
  sendButton: {
    marginTop: 8,
    borderRadius: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  sendButtonContent: {
    paddingVertical: 10,
  },
  sendButtonLabel: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Bottom Spacer
  bottomSpacer: {
    height: 80,
  },
});