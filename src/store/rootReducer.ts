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

const appReducer = combineReducers({
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

export const rootReducer = (state: any, action: any) => {
    if (action.type === 'auth/signOut/fulfilled') {
        return appReducer(undefined, action);
    }
    return appReducer(state, action);
};

export type RootState = ReturnType<typeof appReducer>;
