// src/screens/SplashScreen.tsx
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Image, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../hooks/useAuth';
import { useAppDispatch } from '../store';
import { fetchGroups } from '../store/slices/groupsSlice';
import { fetchExpenses } from '../store/slices/expensesSlice';
import { fetchPersonalTransactions } from '../store/slices/personalFinanceSlice';
import { fetchCompleteBalance } from '../store/slices/personalFinanceSlice';
import { fetchNotifications } from '../store/slices/notificationsSlice';
import { store } from '../store';
import { useUI } from '../hooks/useUI';

export default function SplashScreen() {
  const navigation = useNavigation<any>();
  const { isAuthenticated, initialized } = useAuth();
  const { isOnline } = useUI();
  const dispatch = useAppDispatch();
  const hasNavigatedRef = useRef(false);
  const startTimeRef = useRef(Date.now());
  const dataLoadingRef = useRef(false);
  const scaleAnim = useRef(new Animated.Value(3.8)).current;

  // Animation effect - scale up the icon
  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1.4, // Scale to 110% (slightly larger)
      friction: 4, // Controls the "bounciness"
      tension: 10, // Controls the speed
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        // Start minimum splash timer
        const minSplashPromise = new Promise(resolve => setTimeout(resolve, 800));

        // Wait for Auth Initialization
        // Poll store instead of effect dependencies to avoid re-runs
        const startTime = Date.now();
        let authInitialized = store.getState().auth.initialized;

        while (!authInitialized) {
          if (Date.now() - startTime > 5000) {
            console.warn('Auth initialization timed out, proceeding anyway');
            break;
          }
          await new Promise(r => setTimeout(r, 100));
          authInitialized = store.getState().auth.initialized;
        }

        // Trigger Data Fetch
        if (!dataLoadingRef.current) {
          dataLoadingRef.current = true;
          // Fire and forget - or wait with short timeout if critical
          // Since Provider loads cache, we don't strictly need to wait for fresh data
          Promise.allSettled([
            dispatch(fetchGroups()),
            dispatch(fetchExpenses()),
            dispatch(fetchPersonalTransactions()),
            dispatch(fetchCompleteBalance()),
            dispatch(fetchNotifications()),
          ]).then(() => {
            console.log('Background data fetch completed');
          }).catch(err => {
            console.warn('Background data fetch error:', err);
          });
        }

        // Ensure minimum splash time
        await minSplashPromise;

        if (!mounted) return;
        if (hasNavigatedRef.current) return;
        hasNavigatedRef.current = true;

        // Navigate based on current auth state
        const state = store.getState();
        if (state.auth.isAuthenticated) {
          navigation.reset({
            index: 0,
            routes: [{ name: 'Main' }],
          });
        } else {
          navigation.reset({
            index: 0,
            routes: [{ name: 'Auth' }],
          });
        }
      } catch (error) {
        console.error('Splash screen error:', error);
        // Fallback navigation
        if (mounted && !hasNavigatedRef.current) {
          hasNavigatedRef.current = true;
          navigation.reset({
            index: 0,
            routes: [{ name: 'Auth' }],
          });
        }
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, [dispatch, navigation]); // Removed isOnline, initialized, isAuthenticated from deps

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

