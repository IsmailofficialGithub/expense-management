// src/screens/auth/NewPasswordScreen.tsx
import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Dimensions, TouchableOpacity } from 'react-native';
import { TextInput, Text, HelperText, useTheme } from 'react-native-paper';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { ErrorHandler } from '../../utils/errorHandler';
import { useToast } from '../../hooks/useToast';
import { useNetworkCheck } from '../../hooks/useNetworkCheck';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { authService } from '../../services/supabase.service';
import { useAppDispatch } from '../../store';
import { setPasswordReset } from '../../store/slices/authSlice';

type NewPasswordScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'NewPassword'>;

interface Props {
    navigation: NewPasswordScreenNavigationProp;
}

const { width } = Dimensions.get('window');
const HEADER_HEIGHT = 280;

export default function NewPasswordScreen({ navigation }: Props) {
    const theme = useTheme();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const [isUpdating, setIsUpdating] = useState(false);
    const [error, setError] = useState('');

    const dispatch = useAppDispatch();
    const { showToast } = useToast();
    const { isOnline } = useNetworkCheck();

    const handleUpdatePassword = async () => {
        setError('');

        if (!isOnline) {
            showToast('No internet connection.', 'error');
            return;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setIsUpdating(true);

        try {
            await authService.updatePassword(password);
            // await authService.signOut(); // User is already logged in, no need to sign out
            dispatch(setPasswordReset(false)); // Allow navigation to Main
            showToast('Password updated successfully!', 'success');
            // Navigation handled by AppNavigator switching to Main
        } catch (err: any) {
            ErrorHandler.handleError(err, showToast, 'Update Password');
            setError(err.message || 'Update failed');
        } finally {
            setIsUpdating(false);
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
                    <Text style={styles.headerTitle}>New Password</Text>
                    <Text style={styles.headerSubtitle}>Create a strong password</Text>
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
                                label="New Password"
                                value={password}
                                onChangeText={setPassword}
                                mode="outlined"
                                secureTextEntry={!showPassword}
                                error={!!error}
                                left={<TextInput.Icon icon="lock" color={theme.colors.primary} />}
                                right={<TextInput.Icon icon={showPassword ? 'eye-off' : 'eye'} onPress={() => setShowPassword(!showPassword)} color="#9E9E9E" />}
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
                        </View>

                        <View style={styles.inputContainer}>
                            <TextInput
                                label="Confirm Password"
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                mode="outlined"
                                secureTextEntry={!showConfirmPassword}
                                error={!!error}
                                left={<TextInput.Icon icon="lock-check" color={theme.colors.primary} />}
                                right={<TextInput.Icon icon={showConfirmPassword ? 'eye-off' : 'eye'} onPress={() => setShowConfirmPassword(!showConfirmPassword)} color="#9E9E9E" />}
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

                        <TouchableOpacity onPress={handleUpdatePassword} activeOpacity={0.8} disabled={isUpdating}>
                            <LinearGradient
                                colors={['#00C6FF', '#0072FF']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.loginButton}
                            >
                                <Text style={styles.loginButtonText}>{isUpdating ? 'UPDATING...' : 'UPDATE PASSWORD'}</Text>
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
