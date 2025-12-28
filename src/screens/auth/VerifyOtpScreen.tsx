// src/screens/auth/VerifyOtpScreen.tsx
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
import { RouteProp } from '@react-navigation/native';

type VerifyOtpScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'VerifyOtp'>;
type VerifyOtpScreenRouteProp = RouteProp<AuthStackParamList, 'VerifyOtp'>;

interface Props {
    navigation: VerifyOtpScreenNavigationProp;
    route: VerifyOtpScreenRouteProp;
}

const { width } = Dimensions.get('window');
const HEADER_HEIGHT = 280;

export default function VerifyOtpScreen({ navigation, route }: Props) {
    const { email } = route.params;
    const theme = useTheme();
    const [otp, setOtp] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);
    const [error, setError] = useState('');

    const { showToast } = useToast();
    const { isOnline } = useNetworkCheck();

    const handleVerify = async () => {
        setError('');

        if (!isOnline) {
            showToast('No internet connection.', 'error');
            return;
        }

        if (!otp || otp.length < 6) {
            setError('Please enter a valid 6-digit code');
            return;
        }

        setIsVerifying(true);

        try {
            await authService.verifyOtp(email, otp);
            showToast('Email verified successfully!', 'success');
            navigation.replace('NewPassword');
        } catch (err: any) {
            ErrorHandler.handleError(err, showToast, 'Verify OTP');
            setError(err.message || 'Verification failed');
        } finally {
            setIsVerifying(false);
        }
    };

    return (
        <View style={styles.container}>
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
                    <Text style={styles.headerTitle}>Verification</Text>
                    <Text style={styles.headerSubtitle}>Enter the code sent to {email}</Text>
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
                                label="OTP Code"
                                value={otp}
                                onChangeText={setOtp}
                                mode="outlined"
                                keyboardType="number-pad"
                                autoComplete="sms-otp"
                                maxLength={6}
                                error={!!error}
                                left={<TextInput.Icon icon="lock-check" color={theme.colors.primary} />}
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

                        <TouchableOpacity onPress={handleVerify} activeOpacity={0.8} disabled={isVerifying}>
                            <LinearGradient
                                colors={['#00C6FF', '#0072FF']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.loginButton}
                            >
                                <Text style={styles.loginButtonText}>{isVerifying ? 'VERIFYING...' : 'VERIFY'}</Text>
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
        fontSize: 16,
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
        textAlign: 'center',
        letterSpacing: 4,
        fontWeight: 'bold',
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
    },
    loginButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
});
