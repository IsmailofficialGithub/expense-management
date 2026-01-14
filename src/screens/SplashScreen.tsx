
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Image, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppDispatch } from '../store';
import { useAuth } from '../hooks/useAuth';
import { fetchGroups } from '../store/slices/groupsSlice';
import { fetchExpenses } from '../store/slices/expensesSlice';
import { fetchPersonalTransactions } from '../store/slices/personalFinanceSlice';
import { fetchCompleteBalance } from '../store/slices/personalFinanceSlice';
import { fetchNotifications } from '../store/slices/notificationsSlice';
import { authService } from '../services/supabase.service';

export default function SplashScreen() {
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const { initialized, isAuthenticated } = useAuth();
  const dataLoadingRef = useRef(false);
  const navigationHandledRef = useRef(false);
  const scaleAnim = useRef(new Animated.Value(3.8)).current;

  // Animation effect - scale up the icon
  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1.4,
      friction: 4,
      tension: 10,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  useEffect(() => {
    // Trigger Data Fetch in background to warm up the cache
    if (!dataLoadingRef.current) {
      dataLoadingRef.current = true;
      dispatch(fetchGroups());
      dispatch(fetchExpenses());
      dispatch(fetchPersonalTransactions());
      dispatch(fetchCompleteBalance());
      dispatch(fetchNotifications());
    }
  }, [dispatch]);

  // Handle navigation after 2 seconds
  useEffect(() => {
    const checkSessionAndNavigate = async () => {
      // Wait 2 seconds minimum
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Prevent multiple navigations
      if (navigationHandledRef.current) return;
      navigationHandledRef.current = true;

      try {
        // Check session properly - use getSession (offline-friendly) first
        // This prevents mixing online/offline tokens
        const user = await authService.getCurrentUser();
        
        console.log('[SplashScreen] Session check result:', {
          hasUser: !!user,
          userId: user?.id,
          initialized,
          isAuthenticated,
        });

        // Navigate based on session availability
        if (user) {
          // Session exists (online or offline) - go to dashboard
          console.log('[SplashScreen] ✅ Session found, navigating to Main');
          navigation.replace('Main');
        } else {
          // No session - go to login
          console.log('[SplashScreen] ❌ No session, navigating to Auth');
          navigation.replace('Auth');
        }
      } catch (error) {
        console.error('[SplashScreen] Error checking session:', error);
        // On error, go to login
        navigation.replace('Auth');
      }
    };

    checkSessionAndNavigate();
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.iconContainer,
          {
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Image
          source={require('../../assets/splash-icon.png')}
          style={styles.splashIcon}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#6200EE',
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashIcon: {
    width: 200,
    height: 200,
  },
});
