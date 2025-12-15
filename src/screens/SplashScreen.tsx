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
    const loadDataAndNavigate = async () => {
      // Start loading data immediately in background (while splash is showing)
      // This runs in parallel with auth initialization
      const loadDataPromise = (async () => {
        if (dataLoadingRef.current) return; // Already loading
        dataLoadingRef.current = true;

        try {
          // Load all data in parallel - fetch functions handle offline gracefully
          // They will use cached data if offline, or fetch fresh data if online
          await Promise.allSettled([
            dispatch(fetchGroups()),
            dispatch(fetchExpenses()),
            dispatch(fetchPersonalTransactions()),
            dispatch(fetchCompleteBalance()),
            dispatch(fetchNotifications()),
          ]);
          console.log('Data loaded in background during splash screen');
        } catch (error) {
          // Silently fail - cached data is already loaded in Provider
          console.log('Background data fetch completed (some may have failed, using cache)');
        }
      })();

      // Wait for auth to initialize in parallel with data loading
      let authInitialized = initialized;
      if (!authInitialized) {
        // Poll for auth initialization by checking store state
        while (!authInitialized) {
          await new Promise(resolve => setTimeout(resolve, 50));
          const state = store.getState();
          if (state.auth.initialized) {
            authInitialized = true;
            break;
          }
          // Timeout after 5 seconds
          if (Date.now() - startTimeRef.current > 5000) {
            authInitialized = true; // Proceed anyway
            break;
          }
        }
      }

      // Wait for data loading to complete (or timeout after reasonable time)
      // This ensures we have data ready before navigating
      try {
        await Promise.race([
          loadDataPromise,
          new Promise(resolve => setTimeout(resolve, 10000)), // Max 10 seconds for data loading
        ]);
      } catch (error) {
        // Continue even if data loading fails - cache is already loaded
        console.log('Data loading timed out or failed, proceeding with cache');
      }

      // Ensure minimum 3 seconds splash screen (from when it first showed)
      const elapsed = Date.now() - startTimeRef.current;
      const remainingTime = Math.max(0, 3000 - elapsed);
      
      // Wait for remaining time, then navigate
      await new Promise(resolve => setTimeout(resolve, remainingTime));
      
      if (hasNavigatedRef.current) return; // Prevent double navigation
      hasNavigatedRef.current = true;

      // Navigate based on auth status
      const finalState = store.getState();
      if (finalState.auth.isAuthenticated) {
        // Navigate to Dashboard (Main tab navigator)
        navigation.reset({
          index: 0,
          routes: [{ name: 'Main' }],
        });
      } else {
        // Navigate to Auth
        navigation.reset({
          index: 0,
          routes: [{ name: 'Auth' }],
        });
      }
    };

    loadDataAndNavigate();
  }, [navigation, dispatch, isOnline]);

  // Also listen for auth changes in case it initializes after component mounts
  // This is a fallback - the main effect should handle most cases
  useEffect(() => {
    if (initialized && !hasNavigatedRef.current) {
      // Auth just initialized, ensure data is loading if not already started
      if (!dataLoadingRef.current) {
        dataLoadingRef.current = true;
        // Start data loading if not already started
        Promise.allSettled([
          dispatch(fetchGroups()),
          dispatch(fetchExpenses()),
          dispatch(fetchPersonalTransactions()),
          dispatch(fetchCompleteBalance()),
          dispatch(fetchNotifications()),
        ]).catch(() => {
          // Silently fail - cache is already loaded
        });
      }

      // Wait a bit for data to load, then navigate
      const checkAndNavigate = async () => {
        // Wait for data loading (with timeout) - give it up to 2 seconds
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Ensure minimum 3 seconds
        const elapsed = Date.now() - startTimeRef.current;
        const remainingTime = Math.max(0, 3000 - elapsed);
        await new Promise(resolve => setTimeout(resolve, remainingTime));
        
        if (hasNavigatedRef.current) return;
        hasNavigatedRef.current = true;

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
      };
      
      checkAndNavigate();
    }
  }, [initialized, isAuthenticated, navigation, dispatch]);

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

