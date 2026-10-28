// src/services/domain/auth.ts
import * as SecureStore from 'expo-secure-store';
import { api, AuthUser, clearSession, getStoredUser, setSession } from '../api';
import { Platform } from 'react-native';
import { sendWhatsAppMessageFromHtml } from '../whatsapp.service';
import {
  Profile,
  Group,
  Expense,
  ExpenseSplit,
  Settlement,
  PersonalDebt,
  Notification,
  CreateExpenseRequest,
  CreateGroupRequest,
  SettleUpRequest,
  CreatePersonalDebtRequest,
  ExpenseWithDetails,
  GroupWithMembers,
  ExpenseFilters,
  UserGroupBalance,
  PersonalTransaction,
  UserCompleteBalance,
  PersonalCategory,
  CreatePersonalTransactionRequest,
  ExpenseFoodItem,
  InviteUserRequest,
  GroupInvitation,
  GroupInvitationWithDetails,
  UserPaymentMethod,
  CreatePaymentMethodRequest,
  HotelMenuItem,
  CreateMenuItemRequest,
  GroupAdvanceCollection,
  AdvanceCollectionContribution,
  BulkSettlementSummary,
  Hotel,
  CreateHotelRequest,
  HotelWithMenu,
  CreateFoodExpenseRequest,
} from '../../types/database.types';

export const authService = {
  signUp: async (email: string, password: string, fullName: string, _invitationToken?: string) => {
    // Server emails a confirmation link; the user logs in after confirming.
    return api.post<{ user: AuthUser }>('/auth/signup', { email, password, full_name: fullName });
  },

  signIn: async (email: string, password: string) => {
    const session = await api.post<{ accessToken: string; refreshToken: string; user: AuthUser }>('/auth/login', { email, password });
    await setSession(session);
    return { user: session.user };
  },

  signOut: async () => {
    const refreshToken = await SecureStore.getItemAsync('auth_refresh_token');
    await api.post('/auth/logout', { refreshToken: refreshToken ?? undefined }).catch(() => {});
    await clearSession();
  },

  // Offline-friendly: reads the stored user, no network call.
  getCurrentUser: async () => getStoredUser(),

  resetPassword: async (email: string) => {
    await api.post('/auth/otp', { email });
  },

  // currentPassword is required except right after verifyOtp. Server revokes other sessions and returns a fresh one.
  updatePassword: async (newPassword: string, currentPassword?: string) => {
    await setSession(await api.patch('/auth/password', { password: newPassword, current_password: currentPassword }));
  },

  // Correct code logs the user in, then NewPasswordScreen calls updatePassword.
  verifyOtp: async (email: string, token: string) => {
    const session = await api.post<{ accessToken: string; refreshToken: string; user: AuthUser }>('/auth/verify-otp', {
      email: email.trim().toLowerCase(),
      code: token.trim(),
    });
    await setSession(session);
    return { user: session.user };
  },

  sendOtp: async (email: string) => {
    await api.post('/auth/otp', { email });
  },
};
