// src/screens/auth/ForgotPasswordScreen.tsx
import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Dimensions, TouchableOpacity } from 'react-native';
import { TextInput, Text, HelperText, useTheme } from 'react-native-paper';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/AppNavigator';
import { ErrorHandler } from '../../utils/errorHandler';
import { useToast } from '../../hooks/useToast';
import { useNetworkCheck } from '../../hooks/useNetworkCheck';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { authService } from '../../services/supabase.service';
import { useAppDispatch } from '../../store';
import { setPasswordReset } from '../../store/slices/authSlice';

type ForgotPasswordScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'>;

interface Props {
    navigation: ForgotPasswordScreenNavigationProp;
}

const { width } = Dimensions.get('window');
const HEADER_HEIGHT = 280;

export default function ForgotPasswordScreen({ navigation }: Props) {
    const theme = useTheme();
    const [email, setEmail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const dispatch = useAppDispatch();
    const { showToast } = useToast();
    const { isOnline } = useNetworkCheck();

    const validateEmail = (email: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    const handleResetPassword = async () => {
        setError('');

        if (!isOnline) {
            showToast('No internet connection.', 'error');
            return;
        }

        if (!email) {
            setError('Email is required');
            return;
        } else if (!validateEmail(email)) {
            setError('Invalid email format');
            return;
        }

        setIsSubmitting(true);

        try {
            dispatch(setPasswordReset(true));
            // Use sendOtp for OTP flow instead of resetPassword
            await authService.sendOtp(email);
            showToast('OTP sent to your email!', 'success');
            navigation.navigate('VerifyOtp', { email });
        } catch (err: any) {
            ErrorHandler.handleError(err, showToast, 'Send OTP');
            setError(err.message || 'Failed to send OTP');
        } finally {
            setIsSubmitting(false);
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
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Text style={styles.backButtonText}>← Back</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Forgot Password?</Text>
                    <Text style={styles.headerSubtitle}>Enter your email to reset</Text>
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
                                label="Email"
                                value={email}
                                onChangeText={setEmail}
                                mode="outlined"
                                keyboardType="email-address"
                                autoCapitalize="none"
                                autoComplete="email"
                                error={!!error}
                                left={<TextInput.Icon icon="email" color={theme.colors.primary} />}
                                style={styles.input}
                                theme={{
                                    roundness: 15,
                                    colors: {
                                        primary: '#0072FF',
                                        background: '#fff',
                                        outline: '#E0E0E0',
                                        onSurface: '#000000',
                                        onSurfaceVariant: '#555555',
                                    }
                                }}
                                outlineStyle={{ borderWidth: 1 }}
                            />
                            {error ? <HelperText type="error" visible>{error}</HelperText> : null}
                        </View>

                        <TouchableOpacity onPress={handleResetPassword} activeOpacity={0.8} disabled={isSubmitting}>
                            <LinearGradient
                                colors={['#00C6FF', '#0072FF']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.loginButton}
                            >
                                <Text style={styles.loginButtonText}>{isSubmitting ? 'SENDING...' : 'SEND RESET LINK'}</Text>
                            </LinearGradient>
                        </TouchableOpacity>

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
        paddingTop: 60,
        paddingHorizontal: 20,
    },
    backButton: {
        marginBottom: 20,
    },
    backButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
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
        marginTop: HEADER_HEIGHT - 60, // Slight overlap
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
    loginButton: {
        height: 56,
        borderRadius: 28, // Fully rounded
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#0072FF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    loginButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
});
