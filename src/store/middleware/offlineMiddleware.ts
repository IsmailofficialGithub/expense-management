// src/store/middleware/offlineMiddleware.ts
import { Middleware } from '@reduxjs/toolkit';
import { RootState } from '../rootReducer';
import { storageService } from '../../services/storage.service';
import { syncService, SyncOperationType, SyncEntityType } from '../../services/sync.service';

// Map Redux action types to sync operations - No longer needed as slices handle offline logic
// const getSyncEntity = ...
// const getSyncType = ...

// Actions that should save to local storage
const PERSIST_ACTIONS = [
  'expenses/fetchExpenses/fulfilled',
  'expenses/fetchExpense/fulfilled',
  'expenses/createExpense/fulfilled',
  'expenses/updateExpense/fulfilled',
  'expenses/deleteExpense/fulfilled',
  'expenses/fetchCategories/fulfilled',
  'expenses/fetchSettlements/fulfilled',
  'groups/fetchGroups/fulfilled',
  'groups/fetchGroup/fulfilled',
  'groups/createGroup/fulfilled',
  'groups/updateGroup/fulfilled',
  'groups/deleteGroup/fulfilled',
  'personalFinance/fetchPersonalTransactions/fulfilled',
  'personalFinance/createPersonalTransaction/fulfilled',
  'personalFinance/updatePersonalTransaction/fulfilled',
  'personalFinance/deletePersonalTransaction/fulfilled',
  'personalFinance/fetchPersonalCategories/fulfilled',
];

export const offlineMiddleware: Middleware<{}, RootState> = (store) => (next) => (action) => {
  const result = next(action);
  const state = store.getState();
  // const isOnline = state.ui.isOnline; // Unused
  const actionType = (action as any).type;

  // Handle fulfilled actions - save to local storage
  if (PERSIST_ACTIONS.includes(actionType)) {
    handlePersistAction(action, state);
  }

  // Slices now handle offline queueing internally ('Optimistic UI').

  return result;
};

async function handlePersistAction(action: any, state: RootState) {
  try {
    const actionType = action.type;

    // Persist expenses
    if (actionType.includes('expenses')) {
      if (actionType.includes('fetchExpenses') || actionType.includes('createExpense')) {
        await storageService.setExpenses(state.expenses.expenses);
      }
      if (actionType.includes('fetchCategories')) {
        await storageService.setCategories(state.expenses.categories);
      }
      if (actionType.includes('fetchSettlements')) {
        await storageService.setSettlements(state.expenses.settlements);
      }
    }

    // Persist groups
    if (actionType.includes('groups')) {
      if (actionType.includes('fetchGroups') || actionType.includes('createGroup')) {
        await storageService.setGroups(state.groups.groups);
      }
    }

    // Persist personal finance
    if (actionType.includes('personalFinance')) {
      if (
        actionType.includes('fetchPersonalTransactions') ||
        actionType.includes('createPersonalTransaction')
      ) {
        await storageService.setPersonalTransactions(state.personalFinance.transactions);
      }
      if (actionType.includes('fetchPersonalCategories')) {
        await storageService.setPersonalCategories(state.personalFinance.categories);
      }
    }
  } catch (error) {
    console.error('Error persisting to local storage:', error);
  }
}


