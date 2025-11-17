// src/utils/errorHandler.ts

import { Alert } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

export interface AppError {
  message: string;
  code?: string;
  details?: any;
  isUserFriendly?: boolean;
}

// User-friendly error messages
const ERROR_MESSAGES: { [key: string]: string } = {
  // Network errors
  'Failed to fetch': 'Unable to connect to the server. Please check your internet connection.',
  'Network request failed': 'Network error. Please check your connection and try again.',
  'NetworkError': 'No internet connection. Please check your network settings.',

  // Auth errors
  'Invalid login credentials': 'Incorrect email or password. Please try again.',
  'Email not confirmed': 'Please verify your email address before logging in.',
  'User already registered': 'An account with this email already exists.',
  'Email already exists': 'This email is already registered. Try logging in instead.',
  'Password is too weak': 'Password must be at least 6 characters long.',
  'Invalid email': 'Please enter a valid email address.',

  // Supabase errors
  'JWT expired': 'Your session has expired. Please log in again.',
  'Invalid JWT': 'Session error. Please log in again.',
  'Row level security': 'You do not have permission to perform this action.',

  // Database errors
  'duplicate key value': 'This record already exists.',
  'foreign key constraint': 'Cannot perform this action due to related data.',
  'violates check constraint': 'Invalid data. Please check your input.',

  // Generic
  'timeout': 'Request took too long. Please try again.',
  'cancelled': 'Request was cancelled.',
};

const __DEV__ = process.env.NODE_ENV === 'development';

export class ErrorHandler {
  /**
   * Convert technical error to user-friendly message
   */
  static getUserFriendlyMessage(error: any): string {
    if (!error) return 'An unexpected error occurred';

    if (error.isUserFriendly && error.message) return error.message;

    const errorMessage = error.message || error.toString();

    // Match known error messages
    for (const [key, message] of Object.entries(ERROR_MESSAGES)) {
      if (errorMessage.includes(key)) return message;
    }

    // Supabase error codes
    if (error.code) {
      switch (error.code) {
        case 'PGRST301': return 'You do not have permission to access this resource.';
        case 'PGRST204': return 'The requested data was not found.';
        case '23505': return 'This item already exists.';
        case '23503': return 'Cannot complete this action due to dependencies.';
      }
    }

    return __DEV__
      ? `Error: ${errorMessage}`
      : 'Something went wrong. Please try again.';
  }

  /**
   * Log error for debugging
   */
  static logError(error: any, context?: string) {
    if (__DEV__) {
      console.group(`❌ Error ${context ? `in ${context}` : ''}`);
      console.error('Message:', error.message || error);
      console.error('Code:', error.code);
      console.error('Details:', error);
      console.error('Stack:', error.stack);
      console.groupEnd();
    } else {
      console.error('Error:', error.message);
    }
  }

  /**
   * Show alert popup
   */
  static showAlert(error: any, title: string = 'Error') {
    const message = this.getUserFriendlyMessage(error);

    Alert.alert(
      title,
      message,
      [{ text: 'OK', style: 'default' }],
      { cancelable: true }
    );
  }

  /**
   * Send to toast handler
   */
  static handleError(
    error: any,
    showToast: (message: string, type: 'error') => void,
    context?: string
  ) {
    this.logError(error, context);
    const message = this.getUserFriendlyMessage(error);
    showToast(message, 'error');
  }

  // -----------------------------
  // ⭐ NEW FEATURES START HERE ⭐
  // -----------------------------

  /**
   * Check real network connectivity BEFORE API call
   */
  static async checkNetworkBeforeCall(): Promise<boolean> {
    const netInfo = await NetInfo.fetch();
    return netInfo.isConnected ?? false;
  }

  /**
   * Fully-managed API wrapper:
   * - network check
   * - loading toast
   * - success toast
   * - error handling toast
   */
  static async handleApiCall<T>(
    apiCall: () => Promise<T>,
    showToast: (message: string, type: 'error' | 'success' | 'info') => void,
    options?: {
      loadingMessage?: string;
      successMessage?: string;
      errorContext?: string;
      showLoading?: boolean;
    }
  ): Promise<T | null> {
    // Network check
    const isConnected = await this.checkNetworkBeforeCall();
    if (!isConnected) {
      showToast('No internet connection. Please check your network.', 'error');
      return null;
    }

    try {
      if (options?.showLoading && options?.loadingMessage) {
        showToast(options.loadingMessage, 'info');
      }

      const result = await apiCall();

      if (options?.successMessage) {
        showToast(options.successMessage, 'success');
      }

      return result;
    } catch (error) {
      this.handleError(error, showToast, options?.errorContext);
      return null;
    }
  }
}

// Helper to create user-friendly errors
export const createUserError = (message: string, details?: any): AppError => ({
  message,
  details,
  isUserFriendly: true,
});
