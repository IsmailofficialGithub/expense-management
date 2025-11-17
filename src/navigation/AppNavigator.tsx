// src/navigation/AppNavigator.tsx
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';

// Import screens (we'll create these next)
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import DashboardScreen from '../screens/main/DashboardScreen';
import GroupsScreen from '../screens/main/GroupsScreen';
import ExpensesScreen from '../screens/main/ExpensesScreen';
import ProfileScreen from '../screens/main/ProfileScreen';
import LoadingScreen from '../screens/LoadingScreen';

// Type definitions for navigation
export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  Groups: undefined;
  Expenses: undefined;
  Profile: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainTab = createBottomTabNavigator<MainTabParamList>();

// Auth Stack Navigator (Login, Signup)
function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
    </AuthStack.Navigator>
  );
}

// Main Tab Navigator (Dashboard, Groups, Expenses, Profile)
function MainNavigator() {
  return (
    <MainTab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;

          if (route.name === 'Dashboard') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Groups') {
            iconName = focused ? 'people' : 'people-outline';
          } else if (route.name === 'Expenses') {
            iconName = focused ? 'wallet' : 'wallet-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          } else {
            iconName = 'help-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#6200EE',
        tabBarInactiveTintColor: 'gray',
        headerShown: true,
      })}
    >
      <MainTab.Screen 
        name="Dashboard" 
        component={DashboardScreen}
        options={{ title: 'Dashboard' }}
      />
      <MainTab.Screen 
        name="Groups" 
        component={GroupsScreen}
        options={{ title: 'Groups' }}
      />
      <MainTab.Screen 
        name="Expenses" 
        component={ExpensesScreen}
        options={{ title: 'Expenses' }}
      />
      <MainTab.Screen 
        name="Profile" 
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
    </MainTab.Navigator>
  );
}

// Root Navigator - decides between Auth and Main based on login status
export default function AppNavigator() {
  const { isAuthenticated, initialized } = useAuth();

  // Show loading screen while checking auth status
  if (!initialized) {
    return <LoadingScreen />;
  }

  // Show Auth screens if not logged in, otherwise show Main app
  return isAuthenticated ? <MainNavigator /> : <AuthNavigator />;
}