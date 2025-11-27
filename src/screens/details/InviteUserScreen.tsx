// src/screens/details/InviteUserScreen.tsx
import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Text, TextInput, Button, Card, IconButton, Chip, HelperText } from 'react-native-paper';
import { useToast } from '../../hooks/useToast';
import { useNetworkCheck } from '../../hooks/useNetworkCheck';
import { invitationService } from '../../services/supabase.service';
import LoadingOverlay from '../../components/LoadingOverlay';
import SafeScrollView from '../../components/SafeScrollView';

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
  const { showToast } = useToast();
  const { isOnline } = useNetworkCheck();

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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeScrollView contentContainerStyle={styles.content} hasTabBar={false}>
        {/* Info Card */}
        <Card style={styles.infoCard}>
          <Card.Content>
            <IconButton icon="information" size={32} iconColor="#6200EE" style={styles.infoIcon} />
            <Text style={styles.infoTitle}>How it works</Text>
            <Text style={styles.infoText}>
              • Enter email addresses of people you want to invite{'\n'}
              • We'll create accounts for them automatically{'\n'}
              • They'll receive an email with login credentials{'\n'}
              • They can change their password after first login
            </Text>
          </Card.Content>
        </Card>

        {/* Group Info */}
        <Card style={styles.groupCard}>
          <Card.Content>
            <Text style={styles.label}>Inviting to group:</Text>
            <Text style={styles.groupName}>{groupName}</Text>
          </Card.Content>
        </Card>

        {/* Email Input */}
        <Text style={styles.sectionTitle}>Add Email Addresses</Text>
        <View style={styles.inputRow}>
          <TextInput
            label="Email Address *"
            value={email}
            onChangeText={setEmail}
            mode="outlined"
            keyboardType="email-address"
            autoCapitalize="none"
            error={!!errors.email}
            style={styles.emailInput}
            placeholder="user@example.com"
            onSubmitEditing={handleAddEmail}
          />
          <IconButton
            icon="plus"
            size={24}
            mode="contained"
            onPress={handleAddEmail}
            style={styles.addButton}
            disabled={!email.trim()}
          />
        </View>
        {errors.email ? (
          <HelperText type="error" visible={!!errors.email}>
            {errors.email}
          </HelperText>
        ) : null}

        {/* Invited Emails List */}
        {invitedEmails.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>
              Emails to Invite ({invitedEmails.length})
            </Text>
            <View style={styles.emailsList}>
              {invitedEmails.map((invitedEmail) => (
                <Chip
                  key={invitedEmail}
                  mode="outlined"
                  onClose={() => handleRemoveEmail(invitedEmail)}
                  style={styles.emailChip}
                >
                  {invitedEmail}
                </Chip>
              ))}
            </View>
          </>
        )}

        {/* Send Button */}
        <Button
          mode="contained"
          onPress={handleSendInvitations}
          disabled={invitedEmails.length === 0 || isInviting}
          loading={isInviting}
          style={styles.sendButton}
          contentStyle={styles.sendButtonContent}
        >
          Send Invitations
        </Button>
      </SafeScrollView>

      <LoadingOverlay visible={isInviting} message="Sending invitations..." />
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
  infoCard: {
    marginBottom: 16,
    backgroundColor: '#E8DEF8',
  },
  infoIcon: {
    alignSelf: 'center',
    margin: 0,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6200EE',
    textAlign: 'center',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 22,
  },
  groupCard: {
    marginBottom: 24,
    backgroundColor: '#fff',
  },
  label: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  groupName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  emailInput: {
    flex: 1,
  },
  addButton: {
    marginTop: 6,
    backgroundColor: '#6200EE',
  },
  emailsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  emailChip: {
    marginBottom: 4,
  },
  sendButton: {
    marginTop: 24,
  },
  sendButtonContent: {
    paddingVertical: 8,
  },
});