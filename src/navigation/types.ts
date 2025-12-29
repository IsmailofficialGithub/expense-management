// src/navigation/types.ts
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
    Splash: undefined;
    Auth: undefined;
    Main: undefined;
    NewPassword: undefined;
    GroupDetails: { groupId: string };
    GroupMemberDetails: { groupId: string; userId: string; userName?: string };
    SingleGroupDetails: { groupId: string };
    SingleGroupExpenseDetails: { expenseId: string; groupId?: string };
    ExpenseDetails: { expenseId: string };
    SettleUp: { groupId?: string; userId?: string; amount?: string };
    AddExpense: { groupId?: string; sharedImageUri?: string };
    EditExpense: { expenseId: string };
    PersonalFinance: undefined;
    AddPersonalTransaction: { sharedImageUri?: string };
    ShareHandler: undefined;
    EditPersonalTransaction: { transactionId: string };
    PersonalTransactionDetails: { transactionId: string };
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

export type MainTabParamList = {
    Dashboard: undefined;
    Groups: undefined;
    Expenses: undefined;
    Messages: undefined;
    Notifications: undefined;
    Profile: undefined;
};

export type AuthStackParamList = {
    Login: undefined;
    Signup: undefined;
    ForgotPassword: undefined;
    VerifyOtp: { email: string };
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
    NativeStackScreenProps<RootStackParamList, T>;

export type MainTabScreenProps<T extends keyof MainTabParamList> =
    CompositeScreenProps<
        BottomTabScreenProps<MainTabParamList, T>,
        NativeStackScreenProps<RootStackParamList>
    >;

export type AuthStackScreenProps<T extends keyof AuthStackParamList> =
    NativeStackScreenProps<AuthStackParamList, T>;

declare global {
    namespace ReactNavigation {
        interface RootParamList extends RootStackParamList { }
    }
}
