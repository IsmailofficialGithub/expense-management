// src/screens/forms/AddPaymentMethodScreen.tsx
import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, TextInput, Button, SegmentedButtons, Card, Switch, HelperText, Divider } from 'react-native-paper';
import { useToast } from '../../hooks/useToast';
import { useNetworkCheck } from '../../hooks/useNetworkCheck';
import { useAppDispatch } from '../../store';
import { createPaymentMethod } from '../../store/slices/paymentMethodsSlice';
import { PaymentMethodType } from '../../types/database.types';
import LoadingOverlay from '../../components/LoadingOverlay';

export default function AddPaymentMethodScreen({ navigation }: any) {
  const { showToast } = useToast();
  const { isOnline } = useNetworkCheck();
  const dispatch = useAppDispatch();

  // Form state
  const [methodType, setMethodType] = useState<PaymentMethodType>('cash');
  const [isDefault, setIsDefault] = useState(false);
  const [isVisibleToGroups, setIsVisibleToGroups] = useState(false);

  // Bank details
  const [bankName, setBankName] = useState('');
  const [accountTitle, setAccountTitle] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [iban, setIban] = useState('');

  // Mobile wallet
  const [phoneNumber, setPhoneNumber] = useState('');

  // Card details
  const [cardLastFour, setCardLastFour] = useState('');

  // Other
  const [customName, setCustomName] = useState('');
  const [notes, setNotes] = useState('');

  // Validation
  const [errors, setErrors] = useState({
    bankName: '',
    accountTitle: '',
    accountNumber: '',
    phoneNumber: '',
    cardLastFour: '',
    customName: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateForm = (): boolean => {
    const newErrors = {
      bankName: '',
      accountTitle: '',
      accountNumber: '',
      phoneNumber: '',
      cardLastFour: '',
      customName: '',
    };

    let isValid = true;

    if (methodType === 'bank') {
      if (!bankName.trim()) {
        newErrors.bankName = 'Bank name is required';
        isValid = false;
      }
      if (!accountTitle.trim()) {
        newErrors.accountTitle = 'Account title is required';
        isValid = false;
      }
      if (!accountNumber.trim()) {
        newErrors.accountNumber = 'Account number is required';
        isValid = false;
      }
    }

    if (methodType === 'jazzcash' || methodType === 'easypaisa') {
      if (!phoneNumber.trim()) {
        newErrors.phoneNumber = 'Phone number is required';
        isValid = false;
      } else if (!/^(03|3)\d{9}$/.test(phoneNumber.replace(/[\s-]/g, ''))) {
        newErrors.phoneNumber = 'Invalid phone number format';
        isValid = false;
      }
    }

    if (methodType === 'card') {
      if (cardLastFour && !/^\d{4}$/.test(cardLastFour)) {
        newErrors.cardLastFour = 'Must be 4 digits';
        isValid = false;
      }
    }

    if (methodType === 'other' && !customName.trim()) {
      newErrors.customName = 'Name is required for custom payment method';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    if (!isOnline) {
      showToast('Cannot add payment method. No internet connection.', 'error');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: any = {
        method_type: methodType,
        is_default: isDefault,
        is_visible_to_groups: isVisibleToGroups,
        notes: notes.trim() || undefined,
      };

      // Add type-specific fields
      if (methodType === 'bank') {
        payload.bank_name = bankName.trim();
        payload.account_title = accountTitle.trim();
        payload.account_number = accountNumber.trim();
        payload.iban = iban.trim() || undefined;
      } else if (methodType === 'jazzcash' || methodType === 'easypaisa') {
        payload.phone_number = phoneNumber.trim();
      } else if (methodType === 'card') {
        payload.card_last_four = cardLastFour.trim() || undefined;
      } else if (methodType === 'other') {
        payload.custom_name = customName.trim();
      }

      await dispatch(createPaymentMethod(payload)).unwrap();

      showToast('Payment method added successfully!', 'success');
      navigation.goBack();
    } catch (error: any) {
      console.error('Create payment method error:', error);
      showToast(error.message || 'Failed to add payment method', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderBankFields = () => (
    <>
      <TextInput
        label="Bank Name *"
        value={bankName}
        onChangeText={setBankName}
        mode="outlined"
        error={!!errors.bankName}
        style={styles.input}
        placeholder="e.g., HBL, MCB, Allied Bank"
      />
      {errors.bankName ? (
        <HelperText type="error">{errors.bankName}</HelperText>
      ) : null}

      <TextInput
        label="Account Title *"
        value={accountTitle}
        onChangeText={setAccountTitle}
        mode="outlined"
        error={!!errors.accountTitle}
        style={styles.input}
        placeholder="Your name as per bank account"
      />
      {errors.accountTitle ? (
        <HelperText type="error">{errors.accountTitle}</HelperText>
      ) : null}

      <TextInput
        label="Account Number *"
        value={accountNumber}
        onChangeText={setAccountNumber}
        mode="outlined"
        keyboardType="number-pad"
        error={!!errors.accountNumber}
        style={styles.input}
        placeholder="e.g., 12345678901234"
      />
      {errors.accountNumber ? (
        <HelperText type="error">{errors.accountNumber}</HelperText>
      ) : null}

      <TextInput
        label="IBAN (Optional)"
        value={iban}
        onChangeText={setIban}
        mode="outlined"
        style={styles.input}
        placeholder="PK12ABCD0000001234567890"
      />
    </>
  );

  const renderMobileWalletFields = () => (
    <>
      <TextInput
        label="Phone Number *"
        value={phoneNumber}
        onChangeText={setPhoneNumber}
        mode="outlined"
        keyboardType="phone-pad"
        error={!!errors.phoneNumber}
        style={styles.input}
        placeholder="03001234567"
      />
      {errors.phoneNumber ? (
        <HelperText type="error">{errors.phoneNumber}</HelperText>
      ) : (
        <HelperText type="info">Format: 03XXXXXXXXX</HelperText>
      )}
    </>
  );

  const renderCardFields = () => (
    <>
      <TextInput
        label="Last 4 Digits (Optional)"
        value={cardLastFour}
        onChangeText={setCardLastFour}
        mode="outlined"
        keyboardType="number-pad"
        maxLength={4}
        error={!!errors.cardLastFour}
        style={styles.input}
        placeholder="1234"
      />
      {errors.cardLastFour ? (
        <HelperText type="error">{errors.cardLastFour}</HelperText>
      ) : (
        <HelperText type="info">Last 4 digits of your card for identification</HelperText>
      )}
    </>
  );

  const renderOtherFields = () => (
    <>
      <TextInput
        label="Payment Method Name *"
        value={customName}
        onChangeText={setCustomName}
        mode="outlined"
        error={!!errors.customName}
        style={styles.input}
        placeholder="e.g., Meezan Bank, PayPal"
      />
      {errors.customName ? (
        <HelperText type="error">{errors.customName}</HelperText>
      ) : null}
    </>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.content}>
        {/* Info Card */}
        <Card style={styles.infoCard}>
          <Card.Content>
            <Text style={styles.infoText}>
              💡 Add your payment methods to track how you pay for expenses. You can choose to share details with group members for easy settlements.
            </Text>
          </Card.Content>
        </Card>

        {/* Payment Method Type */}
        <Text style={styles.sectionTitle}>Payment Method Type *</Text>
        <SegmentedButtons
          value={methodType}
          onValueChange={(value) => setMethodType(value as PaymentMethodType)}
          buttons={[
            { value: 'cash', label: 'Cash', icon: 'cash' },
            { value: 'bank', label: 'Bank', icon: 'bank' },
            { value: 'jazzcash', label: 'JazzCash', icon: 'cellphone' },
          ]}
          style={styles.segmentedButtons}
        />
        <SegmentedButtons
          value={methodType}
          onValueChange={(value) => setMethodType(value as PaymentMethodType)}
          buttons={[
            { value: 'easypaisa', label: 'EasyPaisa', icon: 'cellphone' },
            { value: 'card', label: 'Card', icon: 'credit-card' },
            { value: 'other', label: 'Other', icon: 'dots-horizontal' },
          ]}
          style={styles.segmentedButtons}
        />

        <Divider style={styles.divider} />

        {/* Type-specific Fields */}
        <Text style={styles.sectionTitle}>Payment Details</Text>
        {methodType === 'cash' && (
          <Card style={styles.messageCard}>
            <Card.Content>
              <Text style={styles.messageText}>
                💵 Cash payments don't require additional details. Just mark this as your payment method when creating expenses.
              </Text>
            </Card.Content>
          </Card>
        )}
        {methodType === 'bank' && renderBankFields()}
        {(methodType === 'jazzcash' || methodType === 'easypaisa') && renderMobileWalletFields()}
        {methodType === 'card' && renderCardFields()}
        {methodType === 'other' && renderOtherFields()}

        <Divider style={styles.divider} />

        {/* Notes */}
        <Text style={styles.sectionTitle}>Notes (Optional)</Text>
        <TextInput
          label="Additional Notes"
          value={notes}
          onChangeText={setNotes}
          mode="outlined"
          multiline
          numberOfLines={3}
          style={styles.input}
          placeholder="Any additional information..."
        />

        <Divider style={styles.divider} />

        {/* Settings */}
        <Text style={styles.sectionTitle}>Settings</Text>
        <Card style={styles.settingsCard}>
          <Card.Content>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Set as Default</Text>
                <Text style={styles.settingDescription}>
                  Use this method by default when creating expenses
                </Text>
              </View>
              <Switch
                value={isDefault}
                onValueChange={setIsDefault}
              />
            </View>

            <Divider style={styles.divider} />

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Visible to Group Members</Text>
                <Text style={styles.settingDescription}>
                  Allow group members to see this payment method for settlements
                </Text>
              </View>
              <Switch
                value={isVisibleToGroups}
                onValueChange={setIsVisibleToGroups}
              />
            </View>
          </Card.Content>
        </Card>

        {/* Privacy Notice */}
        {isVisibleToGroups && methodType !== 'cash' && (
          <Card style={styles.warningCard}>
            <Card.Content>
              <Text style={styles.warningText}>
                ⚠️ When visible to groups, members will see your {
                  methodType === 'bank' ? 'bank account details' :
                  methodType === 'jazzcash' || methodType === 'easypaisa' ? 'phone number' :
                  methodType === 'card' ? 'card last 4 digits' :
                  'payment information'
                } for easy settlements.
              </Text>
            </Card.Content>
          </Card>
        )}

        {/* Submit Button */}
        <Button
          mode="contained"
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={isSubmitting}
          style={styles.submitButton}
          contentStyle={styles.submitButtonContent}
        >
          Add Payment Method
        </Button>
      </ScrollView>

      <LoadingOverlay visible={isSubmitting} message="Adding payment method..." />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  infoCard: {
    marginBottom: 16,
    backgroundColor: '#E8DEF8',
  },
  infoText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 12,
  },
  segmentedButtons: {
    marginBottom: 8,
  },
  input: {
    marginBottom: 8,
  },
  divider: {
    marginVertical: 16,
  },
  messageCard: {
    backgroundColor: '#FFF9C4',
  },
  messageText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  settingsCard: {
    backgroundColor: '#fff',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
  warningCard: {
    marginTop: 16,
    backgroundColor: '#FFE0B2',
  },
  warningText: {
    fontSize: 13,
    color: '#E65100',
    lineHeight: 20,
  },
  submitButton: {
    marginTop: 24,
  },
  submitButtonContent: {
    paddingVertical: 8,
  },
});