// src/screens/auth/SignupScreen.tsx
import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ImageBackground, Dimensions } from 'react-native';
import { TextInput, Button, Text, Headline, HelperText, useTheme } from 'react-native-paper';
import { useAppDispatch } from '../../store';
import { signUp } from '../../store/slices/authSlice';
import { useAuth } from '../../hooks/useAuth';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/AppNavigator';
import { ErrorHandler } from '../../utils/errorHandler';
import { useToast } from '../../hooks/useToast';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur'; // Verify if available, otherwise just use view with opacity

type SignupScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'Signup'>;

interface Props {
  navigation: SignupScreenNavigationProp;
  route?: {
    params?: {
      email?: string;
      token?: string;
    };
  };
}

export default function SignupScreen({ navigation, route }: Props) {
  const theme = useTheme();
  // Pre-fill email from deep link if available
  const initialEmail = route?.params?.email || '';
  const invitationToken = route?.params?.token;

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const { showToast } = useToast();

  const dispatch = useAppDispatch();
  const { loading, error } = useAuth();

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSignup = async () => {
    // Reset errors
    setErrors({ fullName: '', email: '', password: '', confirmPassword: '' });

    // Validation
    let hasError = false;

    if (!fullName.trim()) {
      setErrors(prev => ({ ...prev, fullName: 'Full name is required' }));
      hasError = true;
    } else if (fullName.trim().length < 2) {
      setErrors(prev => ({ ...prev, fullName: 'Name must be at least 2 characters' }));
      hasError = true;
    }

    if (!email) {
      setErrors(prev => ({ ...prev, email: 'Email is required' }));
      hasError = true;
    } else if (!validateEmail(email)) {
      setErrors(prev => ({ ...prev, email: 'Invalid email format' }));
      hasError = true;
    }

    if (!password) {
      setErrors(prev => ({ ...prev, password: 'Password is required' }));
      hasError = true;
    } else if (password.length < 6) {
      setErrors(prev => ({ ...prev, password: 'Password must be at least 6 characters' }));
      hasError = true;
    }

    if (!confirmPassword) {
      setErrors(prev => ({ ...prev, confirmPassword: 'Please confirm your password' }));
      hasError = true;
    } else if (password !== confirmPassword) {
      setErrors(prev => ({ ...prev, confirmPassword: 'Passwords do not match' }));
      hasError = true;
    }

    if (hasError) return;

    // Dispatch signup action
    try {
      const result = await dispatch(signUp({
        email,
        password,
        full_name: fullName.trim(),
        invitationToken: invitationToken // Pass invitation token if available
      })).unwrap();

      // Check if verification is required
      if (result.requiresVerification) {
        showToast(
          'Account created! Please check your email to verify your account before logging in.',
          'success'
        );
        // Navigate back to login screen
        navigation.navigate('Login');
      } else {
        showToast('Account created successfully!', 'success');
      }
    } catch (err) {
      console.error('Signup failed:', err);
      ErrorHandler.handleError(err, showToast, 'Signup');
    }
  };

  return (
    <ImageBackground
      source={{ uri: 'https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=2029&auto=format&fit=crop' }}
      style={[styles.backgroundImage]}
      resizeMode="cover"
    >
      <LinearGradient
        colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.7)']}
        style={styles.gradient}
      >
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
            <View style={[styles.content]}>
              <View style={[styles.card]}>
                {/* Header */}
                <View style={styles.header}>
                  <Headline style={[styles.title, { color: theme.colors.primary }]}>Create Account</Headline>
                  <Text style={[styles.subtitle, { color: theme.colors.secondary }]}>Join us to track your expenses</Text>
                </View>

                {/* Signup Form */}
                <View style={styles.form}>
                  {/* Full Name Input */}
                  <TextInput
                    label="Full Name"
                    value={fullName}
                    onChangeText={setFullName}
                    mode="outlined"
                    autoCapitalize="words"
                    autoComplete="name"
                    error={!!errors.fullName}
                    left={<TextInput.Icon icon="account" color={theme.colors.primary} />}
                    style={styles.input}
                    theme={{ roundness: 10 }}
                  />
                  {errors.fullName ? (
                    <HelperText type="error" visible={!!errors.fullName}>
                      {errors.fullName}
                    </HelperText>
                  ) : null}

                  {/* Email Input */}
                  <TextInput
                    label="Email"
                    value={email}
                    onChangeText={setEmail}
                    mode="outlined"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    error={!!errors.email}
                    left={<TextInput.Icon icon="email" color={theme.colors.primary} />}
                    style={styles.input}
                    theme={{ roundness: 10 }}
                  />
                  {errors.email ? (
                    <HelperText type="error" visible={!!errors.email}>
                      {errors.email}
                    </HelperText>
                  ) : null}

                  {/* Password Input */}
                  <TextInput
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    mode="outlined"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoComplete="password-new"
                    error={!!errors.password}
                    left={<TextInput.Icon icon="lock" color={theme.colors.primary} />}
                    right={
                      <TextInput.Icon
                        icon={showPassword ? 'eye-off' : 'eye'}
                        onPress={() => setShowPassword(!showPassword)}
                      />
                    }
                    style={styles.input}
                    theme={{ roundness: 10 }}
                  />
                  {errors.password ? (
                    <HelperText type="error" visible={!!errors.password}>
                      {errors.password}
                    </HelperText>
                  ) : null}

                  {/* Confirm Password Input */}
                  <TextInput
                    label="Confirm Password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    mode="outlined"
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                    error={!!errors.confirmPassword}
                    left={<TextInput.Icon icon="lock-check" color={theme.colors.primary} />}
                    right={
                      <TextInput.Icon
                        icon={showConfirmPassword ? 'eye-off' : 'eye'}
                        onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                      />
                    }
                    style={styles.input}
                    theme={{ roundness: 10 }}
                  />
                  {errors.confirmPassword ? (
                    <HelperText type="error" visible={!!errors.confirmPassword}>
                      {errors.confirmPassword}
                    </HelperText>
                  ) : null}

                  {/* Error Message from API */}
                  {error ? (
                    <View style={styles.errorContainer}>
                      <HelperText type="error" visible={!!error} style={styles.errorText}>
                        {error}
                      </HelperText>
                    </View>
                  ) : null}

                  {/* Signup Button */}
                  <Button
                    mode="contained"
                    onPress={handleSignup}
                    loading={loading}
                    disabled={loading}
                    style={styles.button}
                    contentStyle={styles.buttonContent}
                    labelStyle={{ fontSize: 16, fontWeight: 'bold' }}
                  >
                    Sign Up
                  </Button>
                </View>

                {/* Login Link */}
                <View style={styles.footer}>
                  <Text style={styles.footerText}>Already have an account? </Text>
                  <Button
                    mode="text"
                    onPress={() => navigation.navigate('Login')}
                    compact
                    labelStyle={{ fontWeight: 'bold' }}
                  >
                    Login
                  </Button>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
    opacity: 0.5,

  },
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    // padding: 20,
    marginInline: 10,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    padding: 5,
    borderRadius: 20,
    // elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  header: {
    marginBottom: 32,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  input: {
    marginBottom: 12,
    backgroundColor: 'transparent',
  },
  errorContainer: {
    marginBottom: 8,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 30,
    elevation: 2,
  },
  buttonContent: {
    paddingVertical: 10,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  footerText: {
    fontSize: 14,
    color: '#666',
  },
});