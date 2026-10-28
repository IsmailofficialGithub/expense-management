// src/services/domain/money.ts
import { api, qs, requireUser, uploadImage } from '../api';
import {
  Expense,
  Settlement,
  PersonalDebt,
  CreateExpenseRequest,
  SettleUpRequest,
  CreatePersonalDebtRequest,
  ExpenseWithDetails,
  ExpenseFilters,
  PersonalTransaction,
  UserCompleteBalance,
  PersonalCategory,
  CreatePersonalTransactionRequest,
  ExpenseFoodItem,
  GroupAdvanceCollection,
  AdvanceCollectionContribution,
  BulkSettlementSummary,
  CreateFoodExpenseRequest,
} from '../../types/database.types';
import { notificationService } from '../supabase.service';

const triggerNotifications = (expenseId: string, groupId: string) =>
  notificationService.triggerExpenseNotifications(expenseId, groupId)
    .catch(err => console.error('[Create Expense] Notification trigger failed:', err));

// ============================================
// FOOD EXPENSE SERVICE
// ============================================

export const foodExpenseService = {
  // Server computes the amount from the items and writes expense + items + splits in one transaction.
  async createFoodExpense(request: CreateFoodExpenseRequest): Promise<ExpenseWithDetails> {
    const expense = await api.post<Expense>('/expenses', {
      ...request,
      paid_by: request.paid_by || (await requireUser()).id,
      date: request.date || new Date().toISOString().split('T')[0],
    });
    triggerNotifications(expense.id, request.group_id);
    return expenseService.getExpense(expense.id);
  },

  async getFoodItems(expenseId: string): Promise<ExpenseFoodItem[]> {
    return api.get(`/expenses/${expenseId}/food-items`);
  },
};

// ============================================
// PERSONAL FINANCE
// ============================================

export const personalFinanceService = {
  getTransactions: async (): Promise<PersonalTransaction[]> => api.get('/personal-transactions'),

  createTransaction: async (request: CreatePersonalTransactionRequest): Promise<PersonalTransaction> =>
    api.post('/personal-transactions', {
      ...request,
      date: request.date || new Date().toISOString().split('T')[0],
    }),

  updateTransaction: async (transactionId: string, updates: Partial<PersonalTransaction>): Promise<PersonalTransaction> => {
    const { type, category, amount, description, date, notes, receipt_url } = updates;
    return api.patch(`/personal-transactions/${transactionId}`, { type, category, amount, description, date, notes, receipt_url });
  },

  // Server also deletes the receipt file.
  deleteTransaction: async (transactionId: string): Promise<void> => {
    await api.del(`/personal-transactions/${transactionId}`);
  },

  getCategories: async (): Promise<PersonalCategory[]> => api.get('/personal-categories'),

  getCompleteBalance: async (): Promise<UserCompleteBalance> => api.get('/me/complete-balance'),

  getTransactionsByDateRange: async (startDate: string, endDate: string): Promise<PersonalTransaction[]> =>
    api.get(`/personal-transactions${qs({ start: startDate, end: endDate })}`),

  getMonthlySummary: async (year: number, month: number) => {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(Date.UTC(year, month, 0)).toISOString().split('T')[0];
    const data = await personalFinanceService.getTransactionsByDateRange(startDate, endDate);
    const income = data.filter(t => t.type === 'income').reduce((sum, t) => sum + Number(t.amount), 0);
    const expenses = data.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount), 0);
    return { income, expenses, balance: income - expenses, transactions: data };
  },
};

// ============================================
// EXPENSES
// ============================================

export const expenseService = {
  createExpense: async (request: CreateExpenseRequest): Promise<Expense> => {
    let receipt_url: string | null = null;
    if (request.receipt) {
      try {
        receipt_url = await uploadImage('receipts', request.receipt.uri, request.receipt.type || 'image/jpeg');
      } catch (error) {
        console.error('Failed to process receipt:', error);
      }
    }
    const { receipt, ...rest } = request;
    const expense = await api.post<Expense>('/expenses', {
      ...rest,
      date: request.date || new Date().toISOString().split('T')[0],
      receipt_url,
      splits: request.splits.map(s => ({ ...s, amount: s.amount || 0 })),
    });
    triggerNotifications(expense.id, request.group_id);
    return expense;
  },

  getExpenses: async (filters?: ExpenseFilters): Promise<ExpenseWithDetails[]> =>
    api.get(`/expenses${qs({ ...filters })}`),

  async getExpense(expenseId: string): Promise<ExpenseWithDetails> {
    return api.get(`/expenses/${expenseId}`);
  },

  // Pass splits to replace them atomically with the update.
  updateExpense: async (
    expenseId: string,
    updates: Partial<Expense>,
    splits?: { user_id: string; amount: number }[],
  ): Promise<Expense> => {
    const {
      category_id, description, amount, paid_by, date, notes, receipt_url, split_type,
      payment_method_id, payment_method_type, hotel_id,
    } = updates as any;
    return api.patch(`/expenses/${expenseId}`, {
      category_id, description, amount, paid_by, date, notes, receipt_url, split_type,
      payment_method_id, payment_method_type, hotel_id, splits,
    });
  },

  async uploadReceipt(uri: string, mimeType?: string) {
    return uploadImage('receipts', uri, mimeType);
  },

  // Server URLs are permanent, so the "signed URL" is the URL itself.
  async getReceiptUrl(url: string) {
    return url;
  },

  // Deletes the file and clears it from the expense/transaction that references it.
  async deleteReceipt(receiptUrl: string) {
    try {
      const { deleted } = await api.post<{ deleted: boolean }>('/receipts/delete', { url: receiptUrl });
      return deleted;
    } catch (error) {
      console.error('Error deleting receipt:', error);
      return false;
    }
  },

  async replaceSplits(expenseId: string, splits: { user_id: string; amount: number }[]) {
    await api.put(`/expenses/${expenseId}/splits`, { splits });
  },

  // Server deletes splits, food items and the receipt file too.
  deleteExpense: async (expenseId: string) => {
    await api.del(`/expenses/${expenseId}`);
  },

  markSplitAsSettled: async (splitId: string) => api.post(`/expense-splits/${splitId}/settle`),
};

// ============================================
// SETTLEMENTS
// ============================================

export const settlementService = {
  settleUp: async (request: SettleUpRequest): Promise<Settlement> => api.post('/settlements', request),

  getSettlements: async (groupId?: string): Promise<Settlement[]> =>
    api.get(`/settlements${qs({ group_id: groupId })}`),
};

// ============================================
// BULK PAYMENTS
// ============================================

export const bulkPaymentService = {
  // Server creates the collection + member contributions and notifies/emails members.
  createAdvanceCollection: async (request: {
    group_id: string;
    recipient_id: string;
    total_amount?: number;
    per_member_amount?: number;
    description?: string;
  }): Promise<GroupAdvanceCollection> => api.post('/advance-collections', request),

  getAdvanceCollection: async (collectionId: string): Promise<GroupAdvanceCollection> =>
    api.get(`/advance-collections/${collectionId}`),

  getAdvanceCollections: async (
    groupId: string,
    options?: {
      page?: number;
      limit?: number;
      status?: 'active' | 'completed' | 'all';
      dateFrom?: string;
      dateTo?: string;
    }
  ): Promise<GroupAdvanceCollection[]> =>
    api.get(`/groups/${groupId}/advance-collections${qs({ ...options })}`),

  contributeToCollection: async (contributionId: string, notes?: string): Promise<AdvanceCollectionContribution> =>
    api.post(`/advance-contributions/${contributionId}/contribute`, { notes }),

  approveContribution: async (contributionId: string): Promise<AdvanceCollectionContribution> =>
    api.post(`/advance-contributions/${contributionId}/approve`),

  rejectContribution: async (contributionId: string, reason?: string): Promise<AdvanceCollectionContribution> =>
    api.post(`/advance-contributions/${contributionId}/reject`, { reason }),

  getBulkPaymentStats: async (groupId: string): Promise<{
    activeCount: number;
    totalCount: number;
    completedCount: number;
    pendingCount: number;
    totalAmount: number;
    pendingAmount: number;
    activeAmount: number;
  }> => api.get(`/groups/${groupId}/bulk-stats`),

  getBulkSettlementSummary: async (groupId: string, recipientId: string): Promise<BulkSettlementSummary> =>
    api.get(`/groups/${groupId}/bulk-settlement-summary${qs({ recipient_id: recipientId })}`),

  createBulkSettlement: async (request: {
    group_id: string;
    recipient_id: string;
    notes?: string;
  }): Promise<Settlement[]> => api.post('/bulk-settlements', request),
};

// ============================================
// PERSONAL DEBTS
// ============================================

export const personalDebtService = {
  createDebt: async (request: CreatePersonalDebtRequest): Promise<PersonalDebt> => api.post('/personal-debts', request),

  getDebts: async (): Promise<PersonalDebt[]> => api.get('/personal-debts'),

  settleDebt: async (debtId: string) => api.post(`/personal-debts/${debtId}/settle`),

  deleteDebt: async (debtId: string) => {
    await api.del(`/personal-debts/${debtId}`);
  },
};
