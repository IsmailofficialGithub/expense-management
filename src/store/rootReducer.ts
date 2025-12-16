import { combineReducers } from '@reduxjs/toolkit';

// Import slices
import authReducer from './slices/authSlice';
import groupsReducer from './slices/groupsSlice';
import expensesReducer from './slices/expensesSlice';
import notificationsReducer from './slices/notificationsSlice';
import uiReducer from './slices/uiSlice';
import personalFinanceReducer from './slices/personalFinanceSlice';
import paymentMethodsReducer from './slices/paymentMethodsSlice';
import hotelsReducer from './slices/hotelsSlice';
import bulkPaymentsReducer from './slices/bulkPaymentsSlice';

export const rootReducer = combineReducers({
    auth: authReducer,
    groups: groupsReducer,
    expenses: expensesReducer,
    notifications: notificationsReducer,
    paymentMethods: paymentMethodsReducer,
    hotels: hotelsReducer,
    ui: uiReducer,
    personalFinance: personalFinanceReducer,
    bulkPayments: bulkPaymentsReducer,
});

export type RootState = ReturnType<typeof rootReducer>;
