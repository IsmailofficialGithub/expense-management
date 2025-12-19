// src/screens/auth/SignupScreen.tsx
import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Dimensions, TouchableOpacity } from 'react-native';
import { TextInput, Text, HelperText, useTheme } from 'react-native-paper';
import { useAppDispatch } from '../../store';
import { signUp } from '../../store/slices/authSlice';
import { useAuth } from '../../hooks/useAuth';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/AppNavigator';
import { ErrorHandler } from '../../utils/errorHandler';
import { useToast } from '../../hooks/useToast';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';

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

const { width } = Dimensions.get('window');
const HEADER_HEIGHT = 280;

export default function SignupScreen({ navigation, route }: Props) {
  const theme = useTheme();
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
  const [isSigningUp, setIsSigningUp] = useState(false);
  const { showToast } = useToast();

  const dispatch = useAppDispatch();
  const { error } = useAuth();

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSignup = async () => {
    setErrors({ fullName: '', email: '', password: '', confirmPassword: '' });

    let hasError = false;

    if (!fullName.trim()) {
      setErrors(prev => ({ ...prev, fullName: 'Full name is required' }));
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

    setIsSigningUp(true);

    try {
      const result = await dispatch(signUp({
        email,
        password,
        full_name: fullName.trim(),
        invitationToken: invitationToken
      })).unwrap();

      if (result.requiresVerification) {
        showToast(
          'Account created! Please check your email to verify your account.',
          'success'
        );
        navigation.navigate('Login');
      } else {
        showToast('Account created successfully!', 'success');
      }
    } catch (err) {
      console.error('Signup failed:', err);
      ErrorHandler.handleError(err, showToast, 'Signup');
    } finally {
      setIsSigningUp(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Wavy Background Header */}
      <View style={styles.headerContainer}>
        <Svg
          height={HEADER_HEIGHT}
          width={width}
          viewBox={`0 0 ${width} ${HEADER_HEIGHT}`}
          style={styles.svg}
        >
          <Defs>
            <SvgLinearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#00C6FF" stopOpacity="1" />
              <Stop offset="1" stopColor="#0072FF" stopOpacity="1" />
            </SvgLinearGradient>
          </Defs>
          <Path
            d={`M0,0 L${width},0 L${width},${HEADER_HEIGHT - 80} Q${width * 0.5},${HEADER_HEIGHT + 20} 0,${HEADER_HEIGHT - 80} Z`}
            fill="url(#grad)"
          />
        </Svg>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Create Account</Text>
          <Text style={styles.headerSubtitle}>Join us today!</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.formContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>

            <View style={styles.inputContainer}>
              <TextInput
                label="Full Name"
                value={fullName}
                onChangeText={setFullName}
                mode="outlined"
                autoCapitalize="words"
                error={!!errors.fullName}
                left={<TextInput.Icon icon="account" color={theme.colors.primary} />}
                style={styles.input}
                theme={{ roundness: 15, colors: { primary: '#0072FF', background: '#fff', outline: '#E0E0E0', onSurface: '#000000', onSurfaceVariant: '#555555' } }}
              />
              {errors.fullName ? <HelperText type="error" visible>{errors.fullName}</HelperText> : null}
            </View>

            <View style={styles.inputContainer}>
              <TextInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                mode="outlined"
                keyboardType="email-address"
                autoCapitalize="none"
                error={!!errors.email}
                left={<TextInput.Icon icon="email" color={theme.colors.primary} />}
                style={styles.input}
                theme={{ roundness: 15, colors: { primary: '#0072FF', background: '#fff', outline: '#E0E0E0', onSurface: '#000000', onSurfaceVariant: '#555555' } }}
              />
              {errors.email ? <HelperText type="error" visible>{errors.email}</HelperText> : null}
            </View>

            <View style={styles.inputContainer}>
              <TextInput
                label="Password"
                value={password}
                onChangeText={setPassword}
                mode="outlined"
                secureTextEntry={!showPassword}
                error={!!errors.password}
                left={<TextInput.Icon icon="lock" color={theme.colors.primary} />}
                right={<TextInput.Icon icon={showPassword ? 'eye-off' : 'eye'} onPress={() => setShowPassword(!showPassword)} color="#9E9E9E" />}
                style={styles.input}
                theme={{ roundness: 15, colors: { primary: '#0072FF', background: '#fff', outline: '#E0E0E0', onSurface: '#000000', onSurfaceVariant: '#555555' } }}
              />
              {errors.password ? <HelperText type="error" visible>{errors.password}</HelperText> : null}
            </View>

            <View style={styles.inputContainer}>
              <TextInput
                label="Confirm Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                mode="outlined"
                secureTextEntry={!showConfirmPassword}
                error={!!errors.confirmPassword}
                left={<TextInput.Icon icon="lock-check" color={theme.colors.primary} />}
                right={<TextInput.Icon icon={showConfirmPassword ? 'eye-off' : 'eye'} onPress={() => setShowConfirmPassword(!showConfirmPassword)} color="#9E9E9E" />}
                style={styles.input}
                theme={{ roundness: 15, colors: { primary: '#0072FF', background: '#fff', outline: '#E0E0E0', onSurface: '#000000', onSurfaceVariant: '#555555' } }}
              />
              {errors.confirmPassword ? <HelperText type="error" visible>{errors.confirmPassword}</HelperText> : null}
            </View>

            {error ? <HelperText type="error" visible style={styles.apiError}>{error}</HelperText> : null}

            <TouchableOpacity onPress={handleSignup} activeOpacity={0.8} disabled={isSigningUp}>
              <LinearGradient
                colors={['#00C6FF', '#0072FF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.loginButton}
              >
                <Text style={styles.loginButtonText}>{isSigningUp ? 'CREATING ACCOUNT...' : 'SIGN UP'}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text style={styles.signupText}>Login</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  headerContainer: {
    height: HEADER_HEIGHT,
    width: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
  },
  svg: {
    position: 'absolute',
    top: 0,
  },
  headerContent: {
    paddingTop: 80,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
  },
  formContainer: {
    flex: 1,
    marginTop: HEADER_HEIGHT - 60,
    zIndex: 2,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  inputContainer: {
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#fff',
    fontSize: 16,
  },
  apiError: {
    textAlign: 'center',
    marginBottom: 10,
    fontSize: 14,
  },
  loginButton: {
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0072FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    marginTop: 10,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  footerText: {
    color: '#666',
    fontSize: 14,
  },
  signupText: {
    color: '#0072FF',
    fontWeight: 'bold',
    fontSize: 14,
  },
});