// // src/navigation/AppNavigator.tsx
// import React from 'react';
// import { createNativeStackNavigator } from '@react-navigation/native-stack';
// import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
// import { Ionicons } from '@expo/vector-icons';
// import { useAuth } from '../hooks/useAuth';

// // Import screens
// import LoginScreen from '../screens/auth/LoginScreen';
// import SignupScreen from '../screens/auth/SignupScreen';
// import DashboardScreen from '../screens/main/DashboardScreen';
// import GroupsScreen from '../screens/main/GroupsScreen';
// import ExpensesScreen from '../screens/main/ExpensesScreen';
// import ProfileScreen from '../screens/main/ProfileScreen';
// import LoadingScreen from '../screens/LoadingScreen';
// import GroupDetailsScreen from '../screens/details/GroupDetailsScreen';
// import ExpenseDetailsScreen from '../screens/details/ExpenseDetailsScreen';
// import SettleUpScreen from '../screens/details/SettleUpScreen';
// import AddExpenseScreen from '../screens/forms/AddExpenseScreen';
// import EditExpenseScreen from '../screens/forms/EditExpenseScreen';

// // Type definitions for navigation
// export type AuthStackParamList = {
//   Login: undefined;
//   Signup: undefined;
// };

// export type MainTabParamList = {
//   Dashboard: undefined;
//   Groups: undefined;
//   Expenses: undefined;
//   Profile: undefined;
// };

// // *** ADD THIS TYPE FOR THE NEW ROOT STACK ***
// export type RootStackParamList = {
//   Auth: undefined;
//   Main: undefined;
//   GroupDetails: { groupId: string };
//   ExpenseDetails: { expenseId: string };
//   SettleUp: { groupId?: string; userId?: string; amount?: string };
//   AddExpense: { groupId?: string };
//   EditExpense: { expenseId: string };
// };

// const AuthStack = createNativeStackNavigator<AuthStackParamList>();
// const MainTab = createBottomTabNavigator<MainTabParamList>();
// // *** DEFINE THE NEW ROOT STACK ***
// const RootStack = createNativeStackNavigator<RootStackParamList>();

// // Auth Stack Navigator (Login, Signup)
// // *** THIS FUNCTION IS 100% UNCHANGED ***
// function AuthNavigator() {
//   return (
//     <AuthStack.Navigator screenOptions={{ headerShown: false }}>
//       <AuthStack.Screen name="Login" component={LoginScreen} />
//       <AuthStack.Screen name="Signup" component={SignupScreen} />
//     </AuthStack.Navigator>
//   );
// }

// // Main Tab Navigator (Dashboard, Groups, Expenses, Profile)
// // *** THIS FUNCTION IS 100% UNCHANGED ***
// function MainNavigator() {
//   return (
//     <MainTab.Navigator
//       screenOptions={({ route }) => ({
//         tabBarIcon: ({ focused, color, size }) => {
//           let iconName: keyof typeof Ionicons.glyphMap;

//           if (route.name === 'Dashboard') {
//             iconName = focused ? 'home' : 'home-outline';
//           } else if (route.name === 'Groups') {
//             iconName = focused ? 'people' : 'people-outline';
//           } else if (route.name === 'Expenses') {
//             iconName = focused ? 'wallet' : 'wallet-outline';
//           } else if (route.name === 'Profile') {
//             iconName = focused ? 'person' : 'person-outline';
//           } else {
//             iconName = 'help-outline';
//           }

//           return <Ionicons name={iconName} size={size} color={color} />;
//         },
//         tabBarActiveTintColor: '#6200EE',
//         tabBarInactiveTintColor: 'gray',
//         headerShown: true,
//       })}
//     >
//       <MainTab.Screen
//         name="Dashboard"
//         component={DashboardScreen}
//         options={{ title: 'Dashboard' }}
//       />
//       <MainTab.Screen
//         name="Groups"
//         component={GroupsScreen}
//         options={{ title: 'Groups' }}
//       />
//       <MainTab.Screen
//         name="Expenses"
//         component={ExpensesScreen}
//         options={{ title: 'Expenses' }}
//       />
//       <MainTab.Screen
//         name="Profile"
//         component={ProfileScreen}
//         options={{ title: 'Profile' }}
//       />
//     </MainTab.Navigator>
//   );
// }

// // Root Navigator - decides between Auth and Main based on login status
// // *** THIS FUNCTION IS UPDATED ***
// export default function AppNavigator() {
//   const { isAuthenticated, initialized } = useAuth();

//   // Show loading screen while checking auth status
//   if (!initialized) {
//     return <LoadingScreen />;
//   }

//   // Now, we return ONE stack, and let IT manage auth
//   return (
//     <RootStack.Navigator screenOptions={{ headerShown: false }}>
//       {isAuthenticated ? (
//         // User is Logged In: Show Main app and all detail screens
//         <>
//           <RootStack.Screen name="Main" component={MainNavigator} />
//           <RootStack.Screen
//             name="GroupDetails"
//             component={GroupDetailsScreen}
//             options={{ headerShown: true, title: 'Group Details' }} // Show header on detail screens
//           />
//           <RootStack.Screen
//             name="ExpenseDetails"
//             component={ExpenseDetailsScreen}
//             options={{ headerShown: true, title: 'Expense Details' }}
//           />
//           <RootStack.Screen
//             name="SettleUp"
//             component={SettleUpScreen}
//             options={{ headerShown: true, title: 'Settle Up' }}
//           />
//           <RootStack.Screen
//             name="AddExpense"
//             component={AddExpenseScreen}
//             options={{ headerShown: true, title: 'Add Expense' }}
//           />
//           <RootStack.Screen
//             name="EditExpense"
//             component={EditExpenseScreen}
//             options={{ headerShown: true, title: 'Edit Expense' }}
//           />
//         </>
//       ) : (
//         // User is Logged Out: Show Auth screens
//         <RootStack.Screen name="Auth" component={AuthNavigator} />
//       )}
//     </RootStack.Navigator>
//   );
// }
// src/navigation/AppNavigator.tsx
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';

// Import screens
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import DashboardScreen from '../screens/main/DashboardScreen';
import GroupsScreen from '../screens/main/GroupsScreen';
import ExpensesScreen from '../screens/main/ExpensesScreen';
import ProfileScreen from '../screens/main/ProfileScreen';
import LoadingScreen from '../screens/LoadingScreen';
import GroupDetailsScreen from '../screens/details/GroupDetailsScreen';
import ExpenseDetailsScreen from '../screens/details/ExpenseDetailsScreen';
import SettleUpScreen from '../screens/details/SettleUpScreen';
import AddExpenseScreen from '../screens/forms/AddExpenseScreen';
import EditExpenseScreen from '../screens/forms/EditExpenseScreen';

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

// *** ADD THIS TYPE FOR THE NEW ROOT STACK ***
export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  GroupDetails: { groupId: string };
  ExpenseDetails: { expenseId: string };
  SettleUp: { groupId?: string; userId?: string; amount?: string };
  AddExpense: { groupId?: string };
  EditExpense: { expenseId: string };
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
    </AuthStack.Navigator>
  );
}

// Main Tab Navigator (Dashboard, Groups, Expenses, Profile)
// *** THIS FUNCTION IS 100% UNCHANGED ***
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
// *** THIS FUNCTION IS UPDATED ***
export default function AppNavigator() {
  const { isAuthenticated, initialized } = useAuth();

  // Show loading screen while checking auth status
  if (!initialized) {
    return <LoadingScreen />;
  }

  // Now, we return ONE stack, and let IT manage auth
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        // User is Logged In: Show Main app and all detail screens
        <>
          <RootStack.Screen name="Main" component={MainNavigator} />
          <RootStack.Screen
            name="GroupDetails"
            component={GroupDetailsScreen}
            options={{ headerShown: true, title: 'Group Details' }} // Show header on detail screens
          />
          <RootStack.Screen
            name="ExpenseDetails"
            component={ExpenseDetailsScreen}
            options={{ headerShown: true, title: 'Expense Details' }}
          />
          <RootStack.Screen
            name="SettleUp"
            component={SettleUpScreen}
            options={{ headerShown: true, title: 'Settle Up' }}
          />
          <RootStack.Screen
            name="AddExpense"
            component={AddExpenseScreen}
            options={{ headerShown: true, title: 'Add Expense' }}
          />
          <RootStack.Screen
            name="EditExpense"
            component={EditExpenseScreen}
            options={{ headerShown: true, title: 'Edit Expense' }}
          />
        </>
      ) : (
        // User is Logged Out: Show Auth screens
        <RootStack.Screen name="Auth" component={AuthNavigator} />
      )}
    </RootStack.Navigator>
  );
}








