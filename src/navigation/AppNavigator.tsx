
import React, { useEffect, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import NotificationBadge from '../components/NotificationBadge';

// Import screens
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import VerifyOtpScreen from '../screens/auth/VerifyOtpScreen';
import NewPasswordScreen from '../screens/auth/NewPasswordScreen';
import DashboardScreen from '../screens/main/DashboardScreen';
import GroupsScreen from '../screens/main/GroupsScreen';
import ExpensesScreen from '../screens/main/ExpensesScreen';
import ProfileScreen from '../screens/main/ProfileScreen';
import GroupDetailsScreen from '../screens/details/GroupDetailsScreen';
import GroupMemberDetailsScreen from '../screens/details/GroupMemberDetailsScreen';
import SingleGroupDetailsScreen from '../screens/details/SingleGroupDetailsScreen';
import SingleGroupExpenseDetailsScreen from '../screens/details/SingleGroupExpenseDetailsScreen';
import ExpenseDetailsScreen from '../screens/details/ExpenseDetailsScreen';
import SettleUpScreen from '../screens/details/SettleUpScreen';
import AddExpenseScreen from '../screens/forms/AddExpenseScreen';
import EditExpenseScreen from '../screens/forms/EditExpenseScreen';
import PersonalFinanceScreen from '../screens/main/PersonalFinanceScreen';
import AddPersonalTransactionScreen from '../screens/forms/AddPersonalTransactionScreen';
import EditPersonalTransactionScreen from '../screens/forms/EditPersonalTransactionScreen';
import PersonalTransactionDetailsScreen from '../screens/details/PersonalTransactionDetailsScreen';

import InviteUserScreen from '../screens/details/InviteUserScreen';
import AddFoodExpenseScreen from '../screens/forms/AddFoodExpenseScreen';
import PaymentMethodsScreen from '../screens/main/PaymentMethodsScreen';
import AddPaymentMethodScreen from '../screens/forms/AddPaymentMethodScreen';
import ManageHotelScreen from '../screens/admin/ManageHotelScreen';
import EditPaymentMethodScreen from '../screens/forms/EditPaymentMethodScreen';
import InvitationsScreen from '../screens/main/InvitationsScreen';
import MessagesScreen from '../screens/main/MessagesScreen';
import ChatScreen from '../screens/chat/ChatScreen';
import NotificationsScreen from '../screens/main/NotificationsScreen';
import AdvanceCollectionScreen from '../screens/details/AdvanceCollectionScreen';
import BulkSettlementScreen from '../screens/details/BulkSettlementScreen';
import BulkPaymentStatsScreen from '../screens/details/BulkPaymentStatsScreen';
import SplashScreen from '../screens/SplashScreen';
import ShareHandlerScreen from '../screens/ShareHandlerScreen';

import { RootStackParamList, MainTabParamList, AuthStackParamList } from './types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainTab = createBottomTabNavigator<MainTabParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <AuthStack.Screen name="VerifyOtp" component={VerifyOtpScreen} />
    </AuthStack.Navigator>
  );
}

function MainNavigator() {
  const { unreadCount } = useNotifications();

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
          } else if (route.name === 'Messages') {
            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
          } else if (route.name === 'Notifications') {
            iconName = focused ? 'notifications' : 'notifications-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          } else {
            iconName = 'help-outline';
          }

          const icon = <Ionicons name={iconName} size={size} color={color} />;

          if (route.name === 'Notifications') {
            return (
              <View style={{ position: 'relative' }}>
                {icon}
                <NotificationBadge count={unreadCount} size={18} />
              </View>
            );
          }

          return icon;
        },
        tabBarActiveTintColor: '#6200EE',
        tabBarInactiveTintColor: 'gray',
        headerShown: true,
      })}
    >
      <MainTab.Screen name="Dashboard" component={DashboardScreen} />
      <MainTab.Screen name="Groups" component={GroupsScreen} />
      <MainTab.Screen name="Expenses" component={ExpensesScreen} />
      <MainTab.Screen name="Messages" component={MessagesScreen} />
      <MainTab.Screen name="Notifications" component={NotificationsScreen} />
      <MainTab.Screen name="Profile" component={ProfileScreen} />
    </MainTab.Navigator>
  );
}

export default function AppNavigator() {
  const { isAuthenticated, initialized, isPasswordReset } = useAuth();

  console.log('🟢 [APP NAV] Render - isAuthenticated:', isAuthenticated, 'initialized:', initialized, 'isPasswordReset:', isPasswordReset);

  // Use a local state to ensure Splash is shown for a minimum time if needed,
  // but let initialized be the main driver.
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    console.log('🟢 [APP NAV] useEffect triggered - initialized:', initialized);
    if (initialized) {
      console.log('🟢 [APP NAV] App initialized, hiding splash in 1500ms...');
      // Small delay to allow the splash animation to be seen
      const timer = setTimeout(() => {
        console.log('✅ [APP NAV] Hiding splash screen now');
        setShowSplash(false);
      }, 1500);
      return () => {
        console.log('🟢 [APP NAV] Cleanup timer');
        clearTimeout(timer);
      };
    } else {
      console.log('⏳ [APP NAV] Waiting for initialization...');
    }
  }, [initialized]);

  const detailScreenOptions = {
    headerShown: true,
    headerStyle: { backgroundColor: '#6200EE' },
    headerTintColor: '#fff',
    headerTitleStyle: { fontWeight: 'bold' as const },
  };

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {showSplash ? (
        <RootStack.Screen name="Splash" component={SplashScreen} />
      ) : !isAuthenticated ? (
        <RootStack.Screen name="Auth" component={AuthNavigator} />
      ) : (
        <>
          {isPasswordReset ? (
            <RootStack.Screen name="NewPassword" component={NewPasswordScreen} />
          ) : (
            <RootStack.Screen name="Main" component={MainNavigator} />
          )}

          <RootStack.Group screenOptions={detailScreenOptions}>
            <RootStack.Screen name="GroupDetails" component={GroupDetailsScreen} options={{ title: 'Group Details' }} />
            <RootStack.Screen name="GroupMemberDetails" component={GroupMemberDetailsScreen} options={{ title: 'Member Details' }} />
            <RootStack.Screen name="SingleGroupDetails" component={SingleGroupDetailsScreen} options={{ title: 'Group Expenses' }} />
            <RootStack.Screen name="SingleGroupExpenseDetails" component={SingleGroupExpenseDetailsScreen} options={{ title: 'Expense Details' }} />
            <RootStack.Screen name="ExpenseDetails" component={ExpenseDetailsScreen} options={{ title: 'Expense Details' }} />
            <RootStack.Screen name="PersonalFinance" component={PersonalFinanceScreen} options={{ title: 'Personal Finance' }} />
            <RootStack.Screen name="AddPersonalTransaction" component={AddPersonalTransactionScreen} options={{ title: 'Add Transaction' }} />
            <RootStack.Screen name="EditPersonalTransaction" component={EditPersonalTransactionScreen} options={{ title: 'Edit Transaction' }} />
            <RootStack.Screen name="PersonalTransactionDetails" component={PersonalTransactionDetailsScreen} options={{ title: 'Transaction Details' }} />
            <RootStack.Screen name="SettleUp" component={SettleUpScreen} options={{ title: 'Settle Up' }} />
            <RootStack.Screen name="AddExpense" component={AddExpenseScreen} options={{ title: 'Add Expense' }} />
            <RootStack.Screen name="EditExpense" component={EditExpenseScreen} options={{ title: 'Edit Expense' }} />
            <RootStack.Screen name="InviteUser" component={InviteUserScreen} options={{ title: 'Invite Users' }} />
            <RootStack.Screen name="AddFoodExpense" component={AddFoodExpenseScreen} options={{ title: 'Add Food Expense' }} />
            <RootStack.Screen name="PaymentMethods" component={PaymentMethodsScreen} options={{ title: 'Payment Methods' }} />
            <RootStack.Screen name="AddPaymentMethod" component={AddPaymentMethodScreen} options={{ title: 'Add Payment Method' }} />
            <RootStack.Screen name="EditPaymentMethod" component={EditPaymentMethodScreen} options={{ title: 'Edit Payment Method' }} />
            <RootStack.Screen name="ManageHotel" component={ManageHotelScreen} options={{ title: 'Manage Hotels' }} />
            <RootStack.Screen name="Invitations" component={InvitationsScreen} options={{ title: 'Group Invitations' }} />
            <RootStack.Screen name="Chat" component={ChatScreen} options={{ title: 'Chat' }} />
            <RootStack.Screen name="AdvanceCollection" component={AdvanceCollectionScreen} options={{ title: 'Advance Collection' }} />
            <RootStack.Screen name="BulkSettlement" component={BulkSettlementScreen} options={{ title: 'Bulk Settlement' }} />
            <RootStack.Screen name="BulkPaymentStats" component={BulkPaymentStatsScreen} options={{ title: 'Bulk Payment Stats' }} />
          </RootStack.Group>
        </>
      )}
      <RootStack.Screen
        name="ShareHandler"
        component={ShareHandlerScreen}
        options={{
          headerShown: true,
          title: 'Share to Expense',
          headerStyle: { backgroundColor: '#6200EE' },
          headerTintColor: '#fff',
        }}
      />
    </RootStack.Navigator>
  );
}
