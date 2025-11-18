// src/screens/main/ProfileScreen.tsx
import React, { useState } from 'react';
import { View, StyleSheet, Alert, Image } from 'react-native';
import {
  Text,
  Avatar,
  Button,
  List,
  Divider,
  Switch,
  Portal,
  Modal,
  TextInput,
  HelperText,
  IconButton,
  Card,
  ActivityIndicator,
} from 'react-native-paper';
import SafeScrollView from '../../components/SafeScrollView';
import { useAuth } from '../../hooks/useAuth';
import { useAppDispatch } from '../../store';
import { signOut, updateProfile, uploadAvatar } from '../../store/slices/authSlice';
import { setTheme } from '../../store/slices/uiSlice';
import { useUI } from '../../hooks/useUI';
import { format } from 'date-fns';
import { ErrorHandler } from '../../utils/errorHandler';
import { useToast } from '../../hooks/useToast';
import { useNetworkCheck } from '../../hooks/useNetworkCheck';
import LoadingOverlay from '../../components/LoadingOverlay';
import * as ImagePicker from 'expo-image-picker';

export default function ProfileScreen({ navigation }: any) {
  const { profile, loading } = useAuth();
  const { theme } = useUI();
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const { isOnline } = useNetworkCheck();

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);
  const [changePasswordModalVisible, setChangePasswordModalVisible] = useState(false);

  // Edit profile state
  const [editName, setEditName] = useState(profile?.full_name || '');
  const [editPhone, setEditPhone] = useState(profile?.phone || '');
  const [editEmail, setEditEmail] = useState(profile?.email || '');

  // Change password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Avatar upload state
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);

  const [errors, setErrors] = useState({
    name: '',
    phone: '',
    email: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [saving, setSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const isDarkMode = theme === 'dark';

  // Open edit modal
  const handleEditProfile = () => {
    setEditName(profile?.full_name || '');
    setEditPhone(profile?.phone || '');
    setEditEmail(profile?.email || '');
    setErrors({ name: '', phone: '', email: '', currentPassword: '', newPassword: '', confirmPassword: '' });
    setEditModalVisible(true);
  };

  // Validate profile form
  const validateProfileForm = (): boolean => {
    const newErrors = {
      name: '',
      phone: '',
      email: '',
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    };
    let isValid = true;

    if (!editName.trim()) {
      newErrors.name = 'Name is required';
      isValid = false;
    }

    if (editPhone && !/^\+?[\d\s\-()]+$/.test(editPhone)) {
      newErrors.phone = 'Invalid phone number format';
      isValid = false;
    }

    if (!editEmail.trim()) {
      newErrors.email = 'Email is required';
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editEmail)) {
      newErrors.email = 'Invalid email format';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  // Save profile changes
  const handleSaveProfile = async () => {
    if (!validateProfileForm()) return;

    if (!isOnline) {
      showToast('Cannot update profile. No internet connection.', 'error');
      return;
    }

    setSaving(true);
    try {
      await dispatch(
        updateProfile({
          full_name: editName.trim(),
          phone: editPhone.trim() || null,
        })
      ).unwrap();

      setEditModalVisible(false);
      showToast('Profile updated successfully!', 'success');
    } catch (error) {
      ErrorHandler.handleError(error, showToast, 'Update Profile');
    } finally {
      setSaving(false);
    }
  };

  // Handle avatar upload
  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant camera roll permissions to upload avatar.');
      return;
    }

 const result = await ImagePicker.launchImageLibraryAsync({
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.8,
});
    if (!result.canceled && result.assets[0]) {
      setSelectedImageUri(result.assets[0].uri);
      setAvatarModalVisible(true);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant camera permissions to take photos.');
      return;
    }

 const result = await ImagePicker.launchCameraAsync({
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.8,
});

    if (!result.canceled && result.assets[0]) {
      setSelectedImageUri(result.assets[0].uri);
      setAvatarModalVisible(true);
    }
  };

 const handleUploadAvatar = async () => {
  if (!selectedImageUri || !isOnline) {
    showToast('Cannot upload avatar. No internet connection.', 'error');
    return;
  }

  setUploadingAvatar(true);
  try {
    // Pass the URI directly - the service will handle conversion
    await dispatch(uploadAvatar(selectedImageUri)).unwrap();

    setAvatarModalVisible(false);
    setSelectedImageUri(null);
    showToast('Avatar updated successfully!', 'success');
  } catch (error) {
    ErrorHandler.handleError(error, showToast, 'Upload Avatar');
  } finally {
    setUploadingAvatar(false);
  }
};
const handleRemoveAvatar = () => {
  Alert.alert('Remove Avatar', 'Are you sure you want to remove your profile picture?', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Remove',
      style: 'destructive',
      onPress: async () => {
        if (!isOnline) {
          showToast('Cannot remove avatar. No internet connection.', 'error');
          return;
        }

        setIsProcessing(true);
        try {
          // Delete file from storage first
          if (profile?.avatar_url) {
            const urlParts = profile.avatar_url.split('/avatars/');
            if (urlParts.length > 1) {
              const fileName = urlParts[1];
              
              // Import supabase
              const { supabase } = await import('../../services/supabase');
              
              await supabase.storage
                .from('avatars')
                .remove([fileName]);
            }
          }

          // Then update profile to remove URL
          await dispatch(
            updateProfile({
              avatar_url: null,
            })
          ).unwrap();
          
          showToast('Avatar removed successfully', 'success');
        } catch (error) {
          ErrorHandler.handleError(error, showToast, 'Remove Avatar');
        } finally {
          setIsProcessing(false);
        }
      },
    },
  ]);
};

  // Validate password form
  const validatePasswordForm = (): boolean => {
    const newErrors = {
      name: '',
      phone: '',
      email: '',
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    };
    let isValid = true;

    if (!currentPassword) {
      newErrors.currentPassword = 'Current password is required';
      isValid = false;
    }

    if (!newPassword) {
      newErrors.newPassword = 'New password is required';
      isValid = false;
    } else if (newPassword.length < 6) {
      newErrors.newPassword = 'Password must be at least 6 characters';
      isValid = false;
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
      isValid = false;
    } else if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  // Handle password change
  const handleChangePassword = async () => {
    if (!validatePasswordForm()) return;

    if (!isOnline) {
      showToast('Cannot change password. No internet connection.', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      // Note: You'll need to implement this in authSlice
      showToast('Password change feature coming soon!', 'info');
      setChangePasswordModalVisible(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      ErrorHandler.handleError(error, showToast, 'Change Password');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle theme toggle
  const handleThemeToggle = () => {
    dispatch(setTheme(isDarkMode ? 'light' : 'dark'));
    showToast(`${isDarkMode ? 'Light' : 'Dark'} mode enabled`, 'success');
  };

  // Handle sign out
  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setIsProcessing(true);
          try {
            await dispatch(signOut()).unwrap();
            showToast('Signed out successfully', 'info');
          } catch (error) {
            ErrorHandler.handleError(error, showToast, 'Sign Out');
          } finally {
            setIsProcessing(false);
          }
        },
      },
    ]);
  };

  if (!profile) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6200EE" />
      </View>
    );
  }

  return (
    <SafeScrollView contentContainerStyle={{ padding: 16 }}>
      {/* Profile Header */}
      <Card style={styles.headerCard}>
        <Card.Content style={styles.headerContent}>
          <View style={styles.avatarContainer}>
  {profile.avatar_url ? (
    <Avatar.Image size={100} source={{ uri: profile.avatar_url }} />
  ) : (
    <Avatar.Text
      size={100}
      label={profile.full_name?.substring(0, 2).toUpperCase() || 'U'}
      style={styles.avatar}
    />
  )}
  <View style={styles.avatarButtons}>
    <IconButton
      icon="camera"
      size={20}
      mode="contained"
      containerColor="#6200EE"
      iconColor="#fff"
      onPress={() => {
        Alert.alert('Change Avatar', 'Choose an option', [
          { text: 'Take Photo', onPress: handleTakePhoto },
          { text: 'Choose from Gallery', onPress: handlePickAvatar },
          { text: 'Cancel', style: 'cancel' },
          ...(profile.avatar_url
            ? [{ text: 'Remove Avatar', onPress: handleRemoveAvatar, style: 'destructive' as const }]
            : []),
        ]);
      }}
    />
  </View>
</View>

          <View style={styles.headerText}>
            <Text style={styles.userName}>{profile.full_name}</Text>
            <Text style={styles.userEmail}>{profile.email}</Text>
            <Button
              mode="outlined"
              onPress={handleEditProfile}
              style={styles.editButton}
              compact
              icon="pencil"
            >
              Edit Profile
            </Button>
          </View>
        </Card.Content>
      </Card>

      {/* Account Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account Information</Text>
        <Card style={styles.card}>
          <List.Item
            title="Full Name"
            description={profile.full_name || 'Not set'}
            left={(props) => <List.Icon {...props} icon="account" />}
          />
          <Divider />
          <List.Item
            title="Email"
            description={profile.email}
            left={(props) => <List.Icon {...props} icon="email" />}
          />
          <Divider />
          <List.Item
            title="Phone"
            description={profile.phone || 'Not set'}
            left={(props) => <List.Icon {...props} icon="phone" />}
          />
          <Divider />
          <List.Item
            title="Member Since"
            description={format(new Date(profile.created_at), 'MMMM dd, yyyy')}
            left={(props) => <List.Icon {...props} icon="calendar" />}
          />
        </Card>
      </View>

      {/* Security */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security</Text>
        <Card style={styles.card}>
          <List.Item
            title="Change Password"
            description="Update your password"
            left={(props) => <List.Icon {...props} icon="lock" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => setChangePasswordModalVisible(true)}
          />
        </Card>
      </View>

      {/* Preferences */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        <Card style={styles.card}>
          <List.Item
            title="Dark Mode"
            description={isDarkMode ? 'Enabled' : 'Disabled'}
            left={(props) => <List.Icon {...props} icon="theme-light-dark" />}
            right={() => <Switch value={isDarkMode} onValueChange={handleThemeToggle} />}
          />
          <Divider />
          <List.Item
            title="Notifications"
            description="Coming soon"
            left={(props) => <List.Icon {...props} icon="bell" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            disabled
          />
          <Divider />
          <List.Item
            title="Currency"
            description="PKR (₹)"
            left={(props) => <List.Icon {...props} icon="currency-inr" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            disabled
          />
        </Card>
      </View>

      {/* Data & Privacy */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data & Privacy</Text>
        <Card style={styles.card}>
          <List.Item
            title="Export Data"
            description="Download your data"
            left={(props) => <List.Icon {...props} icon="download" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            disabled
          />
          <Divider />
          <List.Item
            title="Privacy Policy"
            description="View our privacy policy"
            left={(props) => <List.Icon {...props} icon="shield-check" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            disabled
          />
          <Divider />
          <List.Item
            title="Terms of Service"
            description="View terms of service"
            left={(props) => <List.Icon {...props} icon="file-document" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            disabled
          />
        </Card>
      </View>

      {/* About */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <Card style={styles.card}>
          <List.Item
            title="App Version"
            description="1.0.0"
            left={(props) => <List.Icon {...props} icon="information" />}
          />
          <Divider />
          <List.Item
            title="Help & Support"
            description="Get help"
            left={(props) => <List.Icon {...props} icon="help-circle" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            disabled
          />
        </Card>
      </View>

      {/* Sign Out Button */}
      <Button
        mode="contained"
        onPress={handleSignOut}
        style={styles.signOutButton}
        buttonColor="#F44336"
        icon="logout"
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
            left={<TextInput.Icon icon="account" />}
          />
          {errors.name ? (
            <HelperText type="error" visible={!!errors.name}>
              {errors.name}
            </HelperText>
          ) : null}

          <TextInput
            label="Email *"
            value={editEmail}
            onChangeText={setEditEmail}
            mode="outlined"
            keyboardType="email-address"
            autoCapitalize="none"
            error={!!errors.email}
            style={styles.input}
            left={<TextInput.Icon icon="email" />}
            editable={false}
          />
          <HelperText type="info" visible>
            Email cannot be changed
          </HelperText>

          <TextInput
            label="Phone"
            value={editPhone}
            onChangeText={setEditPhone}
            mode="outlined"
            keyboardType="phone-pad"
            error={!!errors.phone}
            style={styles.input}
            left={<TextInput.Icon icon="phone" />}
          />
          {errors.phone ? (
            <HelperText type="error" visible={!!errors.phone}>
              {errors.phone}
            </HelperText>
          ) : null}

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

      {/* Avatar Upload Modal */}
      <Portal>
        <Modal
          visible={avatarModalVisible}
          onDismiss={() => {
            setAvatarModalVisible(false);
            setSelectedImageUri(null);
          }}
          contentContainerStyle={styles.modalContent}
        >
          <Text style={styles.modalTitle}>Upload Avatar</Text>

          {selectedImageUri && (
            <View style={styles.avatarPreview}>
              <Image source={{ uri: selectedImageUri }} style={styles.avatarPreviewImage} />
            </View>
          )}

          <View style={styles.modalActions}>
            <Button
              mode="outlined"
              onPress={() => {
                setAvatarModalVisible(false);
                setSelectedImageUri(null);
              }}
              style={styles.modalButton}
              disabled={uploadingAvatar}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleUploadAvatar}
              style={styles.modalButton}
              loading={uploadingAvatar}
              disabled={uploadingAvatar}
            >
              Upload
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* Change Password Modal */}
      <Portal>
        <Modal
          visible={changePasswordModalVisible}
          onDismiss={() => setChangePasswordModalVisible(false)}
          contentContainerStyle={styles.modalContent}
        >
          <Text style={styles.modalTitle}>Change Password</Text>

          <TextInput
            label="Current Password *"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            mode="outlined"
            secureTextEntry={!showCurrentPassword}
            error={!!errors.currentPassword}
            style={styles.input}
            left={<TextInput.Icon icon="lock" />}
            right={
              <TextInput.Icon
                icon={showCurrentPassword ? 'eye-off' : 'eye'}
                onPress={() => setShowCurrentPassword(!showCurrentPassword)}
              />
            }
          />
          {errors.currentPassword ? (
            <HelperText type="error" visible={!!errors.currentPassword}>
              {errors.currentPassword}
            </HelperText>
          ) : null}

          <TextInput
            label="New Password *"
            value={newPassword}
            onChangeText={setNewPassword}
            mode="outlined"
            secureTextEntry={!showNewPassword}
            error={!!errors.newPassword}
            style={styles.input}
            left={<TextInput.Icon icon="lock-outline" />}
            right={
              <TextInput.Icon
                icon={showNewPassword ? 'eye-off' : 'eye'}
                onPress={() => setShowNewPassword(!showNewPassword)}
              />
            }
          />
          {errors.newPassword ? (
            <HelperText type="error" visible={!!errors.newPassword}>
              {errors.newPassword}
            </HelperText>
          ) : null}

          <TextInput
            label="Confirm New Password *"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            mode="outlined"
            secureTextEntry={!showConfirmPassword}
            error={!!errors.confirmPassword}
            style={styles.input}
            left={<TextInput.Icon icon="lock-check" />}
            right={
              <TextInput.Icon
                icon={showConfirmPassword ? 'eye-off' : 'eye'}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              />
            }
          />
          {errors.confirmPassword ? (
            <HelperText type="error" visible={!!errors.confirmPassword}>
              {errors.confirmPassword}
            </HelperText>
          ) : null}

          <View style={styles.modalActions}>
            <Button
              mode="outlined"
              onPress={() => {
                setChangePasswordModalVisible(false);
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
              }}
              style={styles.modalButton}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleChangePassword}
              style={styles.modalButton}
              loading={isProcessing}
              disabled={isProcessing}
            >
              Change
            </Button>
          </View>
        </Modal>
      </Portal>

      <LoadingOverlay visible={isProcessing} message="Processing..." />
    </SafeScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  headerCard: {
    marginBottom: 16,
    backgroundColor: '#fff',
    elevation: 4,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 16,
  },
  avatar: {
    backgroundColor: '#6200EE',
  },
  avatarButtons: {
    position: 'absolute',
    right: -5,
    bottom: -5,
  },
  headerText: {
    flex: 1,
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
    marginBottom: 12,
  },
  editButton: {
    alignSelf: 'flex-start',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#fff',
    elevation: 2,
  },
  signOutButton: {
    marginTop: 8,
    marginBottom: 16,
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 24,
    margin: 20,
    borderRadius: 12,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  input: {
    marginBottom: 8,
    backgroundColor: '#fff',
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
  avatarPreview: {
    alignItems: 'center',
    marginVertical: 16,
  },
  avatarPreviewImage: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 3,
    borderColor: '#6200EE',
  },
});