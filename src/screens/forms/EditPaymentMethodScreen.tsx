// src/screens/forms/EditPaymentMethodScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import SafeScrollView from '../../components/SafeScrollView';
import { Text, TextInput, Button, Card, Switch, HelperText, Divider } from 'react-native-paper';
import { usePaymentMethods } from '../../hooks/usePaymentMethods';
import { useToast } from '../../hooks/useToast';
import { useNetworkCheck } from '../../hooks/useNetworkCheck';
import { useAppDispatch } from '../../store';
import { updatePaymentMethod } from '../../store/slices/paymentMethodsSlice';
import LoadingOverlay from '../../components/LoadingOverlay';

interface Props {
  navigation: any;
  route: {
    params: {
      methodId: string;
    };
  };
}

export default function EditPaymentMethodScreen({ navigation, route }: Props) {
  const { methodId } = route.params;
  const { paymentMethods } = usePaymentMethods();
  const { showToast } = useToast();
  const { isOnline } = useNetworkCheck();
  const dispatch = useAppDispatch();

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
  const [paymentMethod, setPaymentMethod] = useState<any>(null);

  useEffect(() => {
    // Find the payment method
    const method = paymentMethods.find(m => m.id === methodId);
    if (method) {
      setPaymentMethod(method);
      
      // Populate form
      setIsDefault(method.is_default);
      setIsVisibleToGroups(method.is_visible_to_groups);
      setNotes(method.notes || '');

      // Type-specific fields
      if (method.method_type === 'bank') {
        setBankName(method.bank_name || '');
        setAccountTitle(method.account_title || '');
        setAccountNumber(method.account_number || '');
        setIban(method.iban || '');
      } else if (method.method_type === 'jazzcash' || method.method_type === 'easypaisa') {
        setPhoneNumber(method.phone_number || '');
      } else if (method.method_type === 'card') {
        setCardLastFour(method.card_last_four || '');
      } else if (method.method_type === 'other') {
        setCustomName(method.custom_name || '');
      }
    } else {
      showToast('Payment method not found', 'error');
      navigation.goBack();
    }
  }, [methodId, paymentMethods]);

  const validateForm = (): boolean => {
    if (!paymentMethod) return false;

    const newErrors = {
      bankName: '',
      accountTitle: '',
      accountNumber: '',
      phoneNumber: '',
      cardLastFour: '',
      customName: '',
    };

    let isValid = true;

    if (paymentMethod.method_type === 'bank') {
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

    if (paymentMethod.method_type === 'jazzcash' || paymentMethod.method_type === 'easypaisa') {
      if (!phoneNumber.trim()) {
        newErrors.phoneNumber = 'Phone number is required';
        isValid = false;
      } else if (!/^(03|3)\d{9}$/.test(phoneNumber.replace(/[\s-]/g, ''))) {
        newErrors.phoneNumber = 'Invalid phone number format';
        isValid = false;
      }
    }

    if (paymentMethod.method_type === 'card') {
      if (cardLastFour && !/^\d{4}$/.test(cardLastFour)) {
        newErrors.cardLastFour = 'Must be 4 digits';
        isValid = false;
      }
    }

    if (paymentMethod.method_type === 'other' && !customName.trim()) {
      newErrors.customName = 'Name is required for custom payment method';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    if (!isOnline) {
      showToast('Cannot update payment method. No internet connection.', 'error');
      return;
    }

    setIsSubmitting(true);

    try {
      const updates: any = {
        is_default: isDefault,
        is_visible_to_groups: isVisibleToGroups,
        notes: notes.trim() || undefined,
      };

      // Add type-specific fields
      if (paymentMethod.method_type === 'bank') {
        updates.bank_name = bankName.trim();
        updates.account_title = accountTitle.trim();
        updates.account_number = accountNumber.trim();
        updates.iban = iban.trim() || undefined;
      } else if (paymentMethod.method_type === 'jazzcash' || paymentMethod.method_type === 'easypaisa') {
        updates.phone_number = phoneNumber.trim();
      } else if (paymentMethod.method_type === 'card') {
        updates.card_last_four = cardLastFour.trim() || undefined;
      } else if (paymentMethod.method_type === 'other') {
        updates.custom_name = customName.trim();
      }

      await dispatch(updatePaymentMethod({
        methodId,
        updates
      })).unwrap();

      showToast('Payment method updated successfully!', 'success');
      navigation.goBack();
    } catch (error: any) {
      console.error('Update payment method error:', error);
      showToast(error.message || 'Failed to update payment method', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!paymentMethod) {
    return <LoadingOverlay visible={true} message="Loading..." />;
  }

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

  const getMethodTypeName = () => {
    switch (paymentMethod.method_type) {
      case 'cash':
        return 'Cash';
      case 'bank':
        return 'Bank Transfer';
      case 'jazzcash':
        return 'JazzCash';
      case 'easypaisa':
        return 'EasyPaisa';
      case 'card':
        return 'Card';
      case 'other':
        return 'Other';
      default:
        return paymentMethod.method_type;
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeScrollView contentContainerStyle={styles.content} hasTabBar={false}>
        {/* Method Type Info */}
        <Card style={styles.infoCard}>
          <Card.Content>
            <Text style={styles.infoLabel}>Payment Method Type</Text>
            <Text style={styles.infoValue}>{getMethodTypeName()}</Text>
          </Card.Content>
        </Card>

        {/* Type-specific Fields */}
        <Text style={styles.sectionTitle}>Payment Details</Text>
        {paymentMethod.method_type === 'cash' && (
          <Card style={styles.messageCard}>
            <Card.Content>
              <Text style={styles.messageText}>
                💵 Cash payments don't require additional details.
              </Text>
            </Card.Content>
          </Card>
        )}
        {paymentMethod.method_type === 'bank' && renderBankFields()}
        {(paymentMethod.method_type === 'jazzcash' || paymentMethod.method_type === 'easypaisa') && renderMobileWalletFields()}
        {paymentMethod.method_type === 'card' && renderCardFields()}
        {paymentMethod.method_type === 'other' && renderOtherFields()}

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
        {isVisibleToGroups && paymentMethod.method_type !== 'cash' && (
          <Card style={styles.warningCard}>
            <Card.Content>
              <Text style={styles.warningText}>
                ⚠️ When visible to groups, members will see your {
                  paymentMethod.method_type === 'bank' ? 'bank account details' :
                  paymentMethod.method_type === 'jazzcash' || paymentMethod.method_type === 'easypaisa' ? 'phone number' :
                  paymentMethod.method_type === 'card' ? 'card last 4 digits' :
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
          Update Payment Method
        </Button>
      </SafeScrollView>

      <LoadingOverlay visible={isSubmitting} message="Updating payment method..." />
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
  infoLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6200EE',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 12,
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