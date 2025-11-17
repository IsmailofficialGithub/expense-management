// src/screens/main/ProfileScreen.tsx
import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, Card, Avatar, Button, List, Divider, Switch, IconButton, TextInput, Portal, Modal, HelperText } from 'react-native-paper';
import { useAuth } from '../../hooks/useAuth';
import { useUI } from '../../hooks/useUI';
import { useAppDispatch } from '../../store';
import { signOut, updateProfile } from '../../store/slices/authSlice';
import { setTheme } from '../../store/slices/uiSlice';
import { ErrorHandler } from '../../utils/errorHandler';
import { useToast } from '../../hooks/useToast';

export default function ProfileScreen({ navigation }: any) {
  const { profile, user } = useAuth();
  const { theme } = useUI();
  const dispatch = useAppDispatch();
 const { showToast } = useToast();
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState(profile?.full_name || '');
  const [editPhone, setEditPhone] = useState(profile?.phone || '');
  const [errors, setErrors] = useState({ name: '' });
  const [saving, setSaving] = useState(false);

  const isDarkMode = theme === 'dark';

  const handleSignOut = () => {
  Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await dispatch(signOut()).unwrap();
              showToast('Signed out successfully', 'info');
            } catch (error) {
              ErrorHandler.handleError(error, showToast, 'Sign Out');
            }
          },
        },
      ]
    );
  };

  const handleSaveProfile = async () => {
    // Validation
    setErrors({ name: '' });
    if (!editName.trim()) {
      setErrors({ name: 'Name is required' });
      return;
    }

    setSaving(true);
    try {
      await dispatch(updateProfile({
        full_name: editName.trim(),
        phone: editPhone.trim() || null,
      })).unwrap();

      setEditModalVisible(false);
      showToast('Profile updated successfully!', 'success');
    } catch (error) {
        ErrorHandler.handleError(error, showToast, 'Update Profile');
    } finally {
      setSaving(false);
    }
  };

  const handleThemeToggle = () => {
    dispatch(setTheme(isDarkMode ? 'light' : 'dark'));
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile Header Card */}
      <Card style={styles.profileCard}>
        <Card.Content style={styles.profileContent}>
          <View style={styles.avatarContainer}>
            <Avatar.Text 
              size={80} 
              label={profile?.full_name?.substring(0, 2).toUpperCase() || 'U'} 
              style={styles.avatar}
            />
            <IconButton
              icon="camera"
              size={20}
              style={styles.cameraButton}
              iconColor="#fff"
              onPress={() => {
                // TODO: Implement avatar upload
                console.log('Upload avatar');
              }}
            />
          </View>
          
          <Text style={styles.userName}>{profile?.full_name || 'User'}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
          
          <Button
            mode="outlined"
            icon="pencil"
            onPress={() => {
              setEditName(profile?.full_name || '');
              setEditPhone(profile?.phone || '');
              setEditModalVisible(true);
            }}
            style={styles.editButton}
          >
            Edit Profile
          </Button>
        </Card.Content>
      </Card>

      {/* Account Section */}
      <Text style={styles.sectionTitle}>Account</Text>
      <Card style={styles.card}>
        <List.Item
          title="Email"
          description={user?.email}
          left={props => <List.Icon {...props} icon="email" />}
        />
        <Divider />
        <List.Item
          title="Phone"
          description={profile?.phone || 'Not set'}
          left={props => <List.Icon {...props} icon="phone" />}
        />
        <Divider />
        <List.Item
          title="Member Since"
          description={user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
          left={props => <List.Icon {...props} icon="calendar" />}
        />
      </Card>

      {/* Preferences Section */}
      <Text style={styles.sectionTitle}>Preferences</Text>
      <Card style={styles.card}>
        <List.Item
          title="Dark Mode"
          description="Switch between light and dark theme"
          left={props => <List.Icon {...props} icon="theme-light-dark" />}
          right={() => (
            <Switch
              value={isDarkMode}
              onValueChange={handleThemeToggle}
            />
          )}
        />
        <Divider />
        <List.Item
          title="Notifications"
          description="Manage notification preferences"
          left={props => <List.Icon {...props} icon="bell" />}
          right={props => <List.Icon {...props} icon="chevron-right" />}
          onPress={() => {
            // TODO: Navigate to notifications settings
            console.log('Notifications settings');
          }}
        />
        <Divider />
        <List.Item
          title="Currency"
          description="PKR (Pakistani Rupee)"
          left={props => <List.Icon {...props} icon="currency-usd" />}
          right={props => <List.Icon {...props} icon="chevron-right" />}
          onPress={() => {
            // TODO: Navigate to currency settings
            console.log('Currency settings');
          }}
        />
      </Card>

      {/* Data & Privacy Section */}
      <Text style={styles.sectionTitle}>Data & Privacy</Text>
      <Card style={styles.card}>
        <List.Item
          title="Export Data"
          description="Download your data as CSV"
          left={props => <List.Icon {...props} icon="download" />}
          right={props => <List.Icon {...props} icon="chevron-right" />}
          onPress={() => {
            // TODO: Implement data export
            console.log('Export data');
          }}
        />
        <Divider />
        <List.Item
          title="Privacy Policy"
          description="Read our privacy policy"
          left={props => <List.Icon {...props} icon="shield-account" />}
          right={props => <List.Icon {...props} icon="chevron-right" />}
          onPress={() => {
            // TODO: Open privacy policy
            console.log('Privacy policy');
          }}
        />
        <Divider />
        <List.Item
          title="Terms of Service"
          description="Read our terms of service"
          left={props => <List.Icon {...props} icon="file-document" />}
          right={props => <List.Icon {...props} icon="chevron-right" />}
          onPress={() => {
            // TODO: Open terms of service
            console.log('Terms of service');
          }}
        />
      </Card>

      {/* About Section */}
      <Text style={styles.sectionTitle}>About</Text>
      <Card style={styles.card}>
        <List.Item
          title="Version"
          description="1.0.0"
          left={props => <List.Icon {...props} icon="information" />}
        />
        <Divider />
        <List.Item
          title="Help & Support"
          description="Get help or contact support"
          left={props => <List.Icon {...props} icon="help-circle" />}
          right={props => <List.Icon {...props} icon="chevron-right" />}
          onPress={() => {
            // TODO: Open help/support
            console.log('Help & support');
          }}
        />
      </Card>

      {/* Sign Out Button */}
      <Button
        mode="contained"
        icon="logout"
        onPress={handleSignOut}
        style={styles.signOutButton}
        buttonColor="#F44336"
      >
        Sign Out
      </Button>

      {/* Edit Profile Modal */}
      <Portal>
        <Modal
          visible={editModalVisible}
          onDismiss={() => setEditModalVisible(false)}
          contentContainerStyle={styles.modalContent}
        >
          <Text style={styles.modalTitle}>Edit Profile</Text>
          
          <TextInput
            label="Full Name *"
            value={editName}
            onChangeText={setEditName}
            mode="outlined"
            error={!!errors.name}
            style={styles.input}
          />
          {errors.name ? (
            <HelperText type="error" visible={!!errors.name}>
              {errors.name}
            </HelperText>
          ) : null}

          <TextInput
            label="Phone Number"
            value={editPhone}
            onChangeText={setEditPhone}
            mode="outlined"
            keyboardType="phone-pad"
            style={styles.input}
            placeholder="+92 300 1234567"
          />

          <View style={styles.modalActions}>
            <Button
              mode="outlined"
              onPress={() => setEditModalVisible(false)}
              style={styles.modalButton}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleSaveProfile}
              style={styles.modalButton}
              loading={saving}
              disabled={saving}
            >
              Save
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
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  profileCard: {
    marginBottom: 24,
    backgroundColor: '#fff',
    elevation: 2,
  },
  profileContent: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    backgroundColor: '#6200EE',
  },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#6200EE',
    margin: 0,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  editButton: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginTop: 8,
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    marginBottom: 16,
    backgroundColor: '#fff',
    elevation: 2,
  },
  signOutButton: {
    marginTop: 16,
    marginBottom: 32,
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 24,
    margin: 20,
    borderRadius: 8,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
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