
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Image, Animated } from 'react-native';
import { useAppDispatch } from '../store';
import { fetchGroups } from '../store/slices/groupsSlice';
import { fetchExpenses } from '../store/slices/expensesSlice';
import { fetchPersonalTransactions } from '../store/slices/personalFinanceSlice';
import { fetchCompleteBalance } from '../store/slices/personalFinanceSlice';
import { fetchNotifications } from '../store/slices/notificationsSlice';

export default function SplashScreen() {
  const dispatch = useAppDispatch();
  const dataLoadingRef = useRef(false);
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

  // Note: Navigation is handled automatically by AppNavigator based on:
  // - initialized state (from useAuth hook)
  // - isAuthenticated state (from useAuth hook)
  // This screen should not manually navigate - it's just a passive splash screen

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
