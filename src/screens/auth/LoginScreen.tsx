// src/screens/auth/LoginScreen.tsx
import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ImageBackground, Dimensions } from 'react-native';
import { TextInput, Button, Text, Headline, HelperText, useTheme } from 'react-native-paper';
import { useAppDispatch } from '../../store';
import { signIn } from '../../store/slices/authSlice';
import { useAuth } from '../../hooks/useAuth';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/AppNavigator';
import { ErrorHandler } from '../../utils/errorHandler';
import { useToast } from '../../hooks/useToast';
import LoadingOverlay from '../../components/LoadingOverlay';
import { useNetworkCheck } from '../../hooks/useNetworkCheck';
import { LinearGradient } from 'expo-linear-gradient';

type LoginScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

interface Props {
  navigation: LoginScreenNavigationProp;
}

export default function LoginScreen({ navigation }: Props) {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
  const [errors, setErrors] = useState({ email: '', password: '' });

  const { showToast } = useToast();
  const { isOnline } = useNetworkCheck();
  const dispatch = useAppDispatch();
  const { loading, error } = useAuth();

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleLogin = async () => {
    // Reset errors
    setErrors({ email: '', password: '' });


    if (!isOnline) {
      showToast('No internet connection. Please check your network.', 'error');
      return;
    }

    // Validation
    let hasError = false;
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

    if (hasError) return;

    // Show loading overlay
    setShowLoadingOverlay(true);

    // Dispatch login action
    try {
      await dispatch(signIn({ email, password })).unwrap();
      showToast('Welcome back!', 'success');
      // Navigation happens automatically via AppNavigator when isAuthenticated becomes true
    } catch (err) {
      // Error is handled by Redux state
      ErrorHandler.handleError(err, showToast, 'Login');
    } finally {
      // Always stop loading, even on error
      setShowLoadingOverlay(false);
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
          <ScrollView contentContainerStyle={styles.scrollContainer}>
            <View style={styles.content}>
              <View style={[styles.card]}>
                {/* Header */}
                <View style={styles.header}>
                  <Headline style={[styles.title, { color: theme.colors.primary }]}>Welcome Back! 👋</Headline>
                  <Text style={[styles.subtitle, { color: theme.colors.secondary }]}>Login to manage your expenses</Text>
                </View>

                {/* Login Form */}
                <View style={styles.form}>
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
                    autoComplete="password"
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

                  {/* Error Message from API */}
                  {error ? (
                    <HelperText type="error" visible={!!error} style={styles.errorText}>
                      {error}
                    </HelperText>
                  ) : null}

                  {/* Login Button */}
                  <Button
                    mode="contained"
                    onPress={handleLogin}
                    loading={showLoadingOverlay}
                    disabled={showLoadingOverlay}
                    style={styles.button}
                    contentStyle={styles.buttonContent}
                    labelStyle={{ fontSize: 16, fontWeight: 'bold' }}
                  >
                    Login
                  </Button>

                  {/* Forgot Password */}
                  <Button
                    mode="text"
                    onPress={() => {
                      // TODO: Navigate to forgot password screen
                      console.log('Forgot password');
                    }}
                    style={styles.forgotButton}
                    compact
                    labelStyle={{ fontWeight: 'bold', color: theme.colors.primary }}
                  >
                    Forgot Password?
                  </Button>
                </View>

                {/* Sign Up Link */}
                <View style={styles.footer}>
                  <Text style={styles.footerText}>Don't have an account? </Text>
                  <Button
                    mode="text"
                    onPress={() => navigation.navigate('Signup')}
                    compact
                    labelStyle={{ fontWeight: 'bold' }}
                  >
                    Sign Up
                  </Button>
                </View>
              </View>
            </View>
          </ScrollView>
          <LoadingOverlay
            visible={showLoadingOverlay}
            message="Signing in..."
          />
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
    padding: 20,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
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
  errorText: {
    marginBottom: 8,
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
  forgotButton: {
    alignSelf: 'center',
    marginBottom: 8,
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