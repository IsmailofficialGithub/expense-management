
import React from 'react';
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
import LoadingScreen from '../screens/LoadingScreen';
import GroupDetailsScreen from '../screens/details/GroupDetailsScreen';
import SingleGroupDetailsScreen from '../screens/details/SingleGroupDetailsScreen';
import SingleGroupExpenseDetailsScreen from '../screens/details/SingleGroupExpenseDetailsScreen';
import ExpenseDetailsScreen from '../screens/details/ExpenseDetailsScreen';
import SettleUpScreen from '../screens/details/SettleUpScreen';
import AddExpenseScreen from '../screens/forms/AddExpenseScreen';
import EditExpenseScreen from '../screens/forms/EditExpenseScreen';
import PersonalFinanceScreen from '../screens/main/PersonalFinanceScreen';
import AddPersonalTransactionScreen from '../screens/forms/AddPersonalTransactionScreen';
import EditPersonalTransactionScreen from '../screens/forms/EditPersonalTransactionScreen';


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

// Type definitions for navigation
export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
  VerifyOtp: { email: string };
};

export type MainTabParamList = {
  Dashboard: undefined;
  Groups: undefined;
  Expenses: undefined;
  Messages: undefined;
  Notifications: undefined;
  Profile: undefined;
};

// *** ADD THIS TYPE FOR THE NEW ROOT STACK ***
export type RootStackParamList = {
  Splash: undefined;
  Auth: undefined;
  Main: undefined;
  NewPassword: undefined;
  GroupDetails: { groupId: string };
  SingleGroupDetails: { groupId: string };
  SingleGroupExpenseDetails: { expenseId: string; groupId?: string };
  ExpenseDetails: { expenseId: string };
  SettleUp: { groupId?: string; userId?: string; amount?: string };
  AddExpense: { groupId?: string };
  EditExpense: { expenseId: string };
  PersonalFinance: undefined;
  AddPersonalTransaction: undefined;
  EditPersonalTransaction: { transactionId: string };
  InviteUser: { groupId: string; groupName: string };
  AddFoodExpense: { groupId?: string };
  PaymentMethods: undefined;
  AddPaymentMethod: undefined;
  EditPaymentMethod: { methodId: string };
  ManageHotel: undefined;
  Invitations: undefined;
  Messages: undefined;
  Chat: { conversationId: string };
  Notifications: undefined;
  AdvanceCollection: { groupId: string };
  BulkSettlement: { groupId: string };
  BulkPaymentStats: { groupId: string };
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainTab = createBottomTabNavigator<MainTabParamList>();
// *** DEFINE THE NEW ROOT STACK ***
const RootStack = createNativeStackNavigator<RootStackParamList>();

// Auth Stack Navigator (Login, Signup)
// *** THIS FUNCTION IS 100% UNCHANGED ***
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

// Main Tab Navigator (Dashboard, Groups, Expenses, Profile)
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

          // Add badge for Notifications tab
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
        name="Messages"
        component={MessagesScreen}
        options={{ title: 'Messages' }}
      />
      <MainTab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ title: 'Notifications' }}
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
// *** THIS FUNCTION IS UPDATED ***
export default function AppNavigator() {
  const { isAuthenticated, initialized, isPasswordReset } = useAuth();

  // Screen options for detail and form screens
  const detailScreenOptions = {
    headerShown: true,

    headerStyle: {
      backgroundColor: '#6200EE',
    },
    headerTintColor: '#fff',
    headerTitleStyle: {
      fontWeight: 'bold' as const,
    },
  };

  // Show splash screen immediately - it will handle auth initialization in background
  return (
    <RootStack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName="Splash"
    >
      <RootStack.Screen
        name="Splash"
        component={SplashScreen}
        options={{ headerShown: false }}
      />
      {isAuthenticated ? (
        // User is Logged In
        isPasswordReset ? (
          // Force Password Reset Flow
          <RootStack.Screen name="NewPassword" component={NewPasswordScreen} options={{ headerShown: false }} />
        ) : (
          // Normal App Flow
          <>
            <RootStack.Screen name="Main" component={MainNavigator} />
            <RootStack.Screen
              name="GroupDetails"
              component={GroupDetailsScreen}
              options={{ ...detailScreenOptions, title: 'Group Details' }}
            />
            {/* ... other screens ... */}
            <RootStack.Screen
              name="SingleGroupDetails"
              component={SingleGroupDetailsScreen}
              options={{ ...detailScreenOptions, title: 'Group Expenses' }}
            />
            <RootStack.Screen
              name="SingleGroupExpenseDetails"
              component={SingleGroupExpenseDetailsScreen}
              options={{ ...detailScreenOptions, title: 'Expense Details' }}
            />
            <RootStack.Screen
              name="ExpenseDetails"
              component={ExpenseDetailsScreen}
              options={{ ...detailScreenOptions, title: 'Expense Details' }}
            />
            <RootStack.Screen
              name="PersonalFinance"
              component={PersonalFinanceScreen}
              options={{ ...detailScreenOptions, title: 'Personal Finance' }}
            />
            <RootStack.Screen
              name="AddPersonalTransaction"
              component={AddPersonalTransactionScreen}
              options={{ ...detailScreenOptions, title: 'Add Transaction' }}
            />
            <RootStack.Screen
              name="EditPersonalTransaction"
              component={EditPersonalTransactionScreen}
              options={{ ...detailScreenOptions, title: 'Edit Transaction' }}
            />
            <RootStack.Screen
              name="SettleUp"
              component={SettleUpScreen}
              options={{ ...detailScreenOptions, title: 'Settle Up' }}
            />
            <RootStack.Screen
              name="AddExpense"
              component={AddExpenseScreen}
              options={{ ...detailScreenOptions, title: 'Add Expense' }}
            />
            <RootStack.Screen
              name="EditExpense"
              component={EditExpenseScreen}
              options={{ ...detailScreenOptions, title: 'Edit Expense' }}
            />
            <RootStack.Screen
              name="InviteUser"
              component={InviteUserScreen}
              options={{ ...detailScreenOptions, title: 'Invite Users' }}
            />
            <RootStack.Screen
              name="AddFoodExpense"
              component={AddFoodExpenseScreen}
              options={{ ...detailScreenOptions, title: 'Add Food Expense' }}
            />
            <RootStack.Screen
              name="PaymentMethods"
              component={PaymentMethodsScreen}
              options={{ ...detailScreenOptions, title: 'Payment Methods' }}
            />
            <RootStack.Screen
              name="AddPaymentMethod"
              component={AddPaymentMethodScreen}
              options={{ ...detailScreenOptions, title: 'Add Payment Method' }}
            />
            <RootStack.Screen
              name="EditPaymentMethod"
              component={EditPaymentMethodScreen}
              options={{ ...detailScreenOptions, title: 'Edit Payment Method' }}
            />
            <RootStack.Screen
              name="ManageHotel"
              component={ManageHotelScreen}
              options={{ ...detailScreenOptions, title: 'Manage Hotels' }}
            />
            <RootStack.Screen
              name="Invitations"
              component={InvitationsScreen}
              options={{ ...detailScreenOptions, title: 'Group Invitations' }}
            />
            <RootStack.Screen
              name="Chat"
              component={ChatScreen}
              options={{ ...detailScreenOptions, title: 'Chat' }}
            />
            <RootStack.Screen
              name="AdvanceCollection"
              component={AdvanceCollectionScreen}
              options={{ ...detailScreenOptions, title: 'Advance Collection' }}
            />
            <RootStack.Screen
              name="BulkSettlement"
              component={BulkSettlementScreen}
              options={{ ...detailScreenOptions, title: 'Bulk Settlement' }}
            />
            <RootStack.Screen
              name="BulkPaymentStats"
              component={BulkPaymentStatsScreen}
              options={{ ...detailScreenOptions, title: 'Bulk Payment Stats' }}
            />
          </>
        )
      ) : (
        // User is Logged Out: Show Auth screens
        <RootStack.Screen name="Auth" component={AuthNavigator} />
      )}
    </RootStack.Navigator>
  );
}








