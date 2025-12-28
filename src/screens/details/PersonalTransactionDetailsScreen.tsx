import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Image, Alert, Dimensions, StatusBar, RefreshControl, TouchableOpacity, Animated } from 'react-native';
import { Text, Button, IconButton, useTheme, Card, Divider, Chip, Portal, Modal, Surface } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePersonalFinance } from '../../hooks/usePersonalFinance';
import { useToast } from '../../hooks/useToast';
import { useNetworkCheck } from '../../hooks/useNetworkCheck';
import { useAppDispatch } from '../../store';
import {
  deletePersonalTransaction,
  fetchPersonalTransactions,
} from '../../store/slices/personalFinanceSlice';
import { ErrorHandler } from '../../utils/errorHandler';
import LoadingOverlay from '../../components/LoadingOverlay';
import { format } from 'date-fns';
import { supabase } from '../../services/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

interface Props {
  navigation: any;
  route: {
    params: {
      transactionId: string;
    };
  };
}

export default function PersonalTransactionDetailsScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { transactionId } = route.params;
  const { transactions, loading } = usePersonalFinance();
  const { showToast } = useToast();
  const { isOnline } = useNetworkCheck();
  const dispatch = useAppDispatch();

  const [refreshing, setRefreshing] = useState(false);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const scrollY = React.useRef(new Animated.Value(0)).current;

  // Find the transaction
  const transaction = transactions.find(t => t.id === transactionId);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await dispatch(fetchPersonalTransactions()).unwrap();
    } catch (error) {
      console.error('Failed to refresh transaction details:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = () => {
    if (!isOnline) {
      showToast('Cannot delete transaction. No internet connection.', 'error');
      return;
    }

    Alert.alert(
      'Delete Transaction',
      'Are you sure you want to delete this transaction? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await dispatch(deletePersonalTransaction(transactionId)).unwrap();
              showToast('Transaction deleted successfully', 'success');
              navigation.goBack();
            } catch (error) {
              ErrorHandler.handleError(error, showToast, 'Delete Transaction');
            }
          },
        },
      ]
    );
  };

  const handleEdit = () => {
    navigation.navigate('EditPersonalTransaction', { transactionId });
  };

  if (!transaction && !loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <Surface style={styles.errorSurface} elevation={1}>
          <IconButton icon="alert-circle" size={60} iconColor={theme.colors.error} />
          <Text variant="headlineSmall" style={{ fontWeight: 'bold' }}>Transaction not found</Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 8 }}>
            It might have been deleted or is currently unavailable.
          </Text>
          <Button mode="contained" onPress={() => navigation.goBack()} style={styles.backButton}>
            Go Back
          </Button>
        </Surface>
      </View>
    );
  }

  if (!transaction) return <LoadingOverlay visible={true} message="Loading details..." />;

  const isIncome = transaction.type === 'income';
  const accentColor = isIncome ? theme.colors.primary : theme.colors.error;
  const gradientColors = (isIncome 
    ? [theme.colors.primary, theme.colors.primaryContainer] 
    : [theme.colors.error, '#d32f2f']) as [string, string]; // Type cast to satisfy LinearGradient requirements

  const headerHeight = 280;
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, headerHeight - 100],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const headerTranslate = scrollY.interpolate({
    inputRange: [0, headerHeight],
    outputRange: [0, -headerHeight / 2],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      {/* Dynamic Header Background */}
      <Animated.View style={[
        styles.headerBackground, 
        { 
          height: headerHeight,
          opacity: headerOpacity,
          transform: [{ translateY: headerTranslate }]
        }
      ]}>
        <LinearGradient
          colors={gradientColors}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>

      <Animated.ScrollView 
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="white" />
        }
      >
        {/* Banner Section Content */}
        <View style={[styles.headerContent, { height: headerHeight, paddingTop: insets.top + 20 }]}>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>{transaction.description}</Text>
            <View style={styles.amountContainer}>
              <Text style={styles.amountSymbol}>{isIncome ? '+' : '-'}</Text>
              <Text style={styles.headerAmount}>₹{transaction.amount.toFixed(2)}</Text>
            </View>
            <BlurView intensity={30} tint="light" style={styles.typeBlur}>
              <View style={styles.typeContainer}>
                <MaterialCommunityIcons 
                  name={isIncome ? "arrow-down-circle" : "arrow-up-circle"} 
                  size={20} 
                  color="white" 
                />
                <Text style={styles.typeText}>{isIncome ? 'Income' : 'Expense'}</Text>
              </View>
            </BlurView>
          </View>
        </View>

        <View style={styles.mainContent}>
          {/* Info Card with better tiles */}
          <Surface style={styles.infoSurface} elevation={2}>
            <View style={styles.infoGrid}>
              <View style={styles.gridItem}>
                <IconButton icon="tag-outline" size={24} iconColor={accentColor} style={styles.gridIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.gridLabel}>Category</Text>
                  <Text variant="titleMedium" style={styles.gridValue} numberOfLines={1} ellipsizeMode="tail">{transaction.category}</Text>
                </View>
              </View>
              <View style={styles.gridItem}>
                <IconButton icon="calendar-outline" size={24} iconColor={accentColor} style={styles.gridIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.gridLabel}>Date</Text>
                  <Text variant="titleMedium" style={styles.gridValue} numberOfLines={1} ellipsizeMode="tail">{format(new Date(transaction.date), 'MMMM dd, yyyy')}</Text>
                </View>
              </View>
            </View>
          </Surface>

          {/* Notes Section */}
          {transaction.notes && (
            <Surface style={styles.sectionSurface} elevation={1}>
              <View style={styles.sectionHeader}>
                <MaterialCommunityIcons name="note-text-outline" size={22} color={theme.colors.onSurfaceVariant} />
                <Text variant="titleMedium" style={styles.sectionTitle}>Notes</Text>
              </View>
              <Text variant="bodyLarge" style={styles.notesText}>{transaction.notes}</Text>
            </Surface>
          )}

          {/* Receipt Section */}
          {transaction.receipt_url && (
            <Surface style={styles.sectionSurface} elevation={1}>
              <View style={styles.sectionHeader}>
                <MaterialCommunityIcons name="receipt" size={22} color={theme.colors.onSurfaceVariant} />
                <Text variant="titleMedium" style={styles.sectionTitle}>Receipt</Text>
                <IconButton 
                  icon="fullscreen" 
                  size={24} 
                  onPress={() => setImageModalVisible(true)} 
                  style={styles.fullscreenIcon}
                />
              </View>
              <TouchableOpacity onPress={() => setImageModalVisible(true)} activeOpacity={0.9}>
                <View style={styles.receiptContainer}>
                  <Image 
                    source={{ uri: transaction.receipt_url }} 
                    style={styles.receiptImage}
                    resizeMode="cover"
                  />
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.3)']}
                    style={styles.imageGradient}
                  />
                </View>
              </TouchableOpacity>
            </Surface>
          )}

          {/* Metadata Section */}
          <View style={styles.metaSection}>
            <View style={styles.metaRow}>
              <MaterialCommunityIcons name="clock-outline" size={14} color={theme.colors.onSurfaceVariant} />
              <Text style={styles.metaText}>Created: {format(new Date(transaction.created_at), 'MMM dd, yyyy HH:mm')}</Text>
            </View>
            {transaction.updated_at !== transaction.created_at && (
              <View style={styles.metaRow}>
                <MaterialCommunityIcons name="pencil-outline" size={14} color={theme.colors.onSurfaceVariant} />
                <Text style={styles.metaText}>Updated: {format(new Date(transaction.updated_at), 'MMM dd, yyyy HH:mm')}</Text>
              </View>
            )}
          </View>
        </View>
      </Animated.ScrollView>

      {/* Modern Action Buttons Overlay */}
      <BlurView intensity={80} style={[styles.actionBlur, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.actionContainer}>
          <Button 
            mode="outlined" 
            icon="delete-outline" 
            onPress={handleDelete}
            textColor={theme.colors.error}
            style={[styles.actionButton, { borderColor: theme.colors.error }]}
          >
            Delete
          </Button>
          <Button 
            mode="contained" 
            icon="pencil" 
            onPress={handleEdit}
            style={[styles.actionButton, styles.editButton, { backgroundColor: accentColor }]}
            contentStyle={{ height: 48 }}
          >
            Edit Transaction
          </Button>
        </View>
      </BlurView>

      {/* Full Screen Image Modal */}
      <Portal>
        <Modal
          visible={imageModalVisible}
          onDismiss={() => setImageModalVisible(false)}
          contentContainerStyle={styles.modalContainer}
        >
          {transaction.receipt_url && (
            <View style={styles.modalContent}>
              <TouchableOpacity 
                style={styles.modalCloseArea} 
                activeOpacity={1} 
                onPress={() => setImageModalVisible(false)}
              >
                <IconButton 
                  icon="close" 
                  size={30} 
                  iconColor="white" 
                  style={styles.modalCloseBtn} 
                  onPress={() => setImageModalVisible(false)} 
                />
                <Image 
                  source={{ uri: transaction.receipt_url }} 
                  style={styles.fullScreenImage}
                  resizeMode="contain"
                />
              </TouchableOpacity>
            </View>
          )}
        </Modal>
      </Portal>

      <LoadingOverlay visible={loading && !transaction} message="Syncing..." />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorSurface: {
    padding: 24,
    borderRadius: 24,
    width: '100%',
    alignItems: 'center',
  },
  backButton: {
    marginTop: 24,
    width: '100%',
  },
  headerBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 0,
  },
  headerContent: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  headerInfo: {
    alignItems: 'center',
    width: '100%',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  amountSymbol: {
    fontSize: 24,
    color: 'white',
    marginRight: 4,
    fontWeight: '600',
  },
  headerAmount: {
    fontSize: 48,
    fontWeight: 'bold',
    color: 'white',
  },
  typeBlur: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  typeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  typeText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
    marginLeft: 8,
    textTransform: 'uppercase',
  },
  mainContent: {
    paddingHorizontal: 16,
    marginTop: -30,
  },
  infoSurface: {
    borderRadius: 24,
    padding: 8,
    marginBottom: 16,
    backgroundColor: 'white',
  },
  infoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    flexWrap: 'wrap',
  },
  gridItem: {
    minWidth: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginRight: 4,
  },
  gridIcon: {
    margin: 0,
    marginRight: 4,
  },
  gridLabel: {
    fontSize: 11,
    color: '#6e6e73',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  gridValue: {
    fontWeight: '700',
    fontSize: 15,
  },
  sectionSurface: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    backgroundColor: 'white',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    marginLeft: 10,
    fontWeight: '700',
    color: '#1d1d1f',
  },
  fullscreenIcon: {
    marginLeft: 'auto',
    margin: 0,
  },
  notesText: {
    color: '#424245',
    lineHeight: 22,
    fontSize: 16,
  },
  receiptContainer: {
    width: '100%',
    height: 240,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#f5f5f7',
  },
  receiptImage: {
    width: '100%',
    height: '100%',
  },
  imageGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
  },
  metaSection: {
    alignItems: 'center',
    marginTop: 8,
    paddingBottom: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#86868b',
    marginLeft: 6,
  },
  actionBlur: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  actionContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    borderRadius: 16,
  },
  editButton: {
    flex: 2,
  },
  modalContainer: {
    flex: 1,
    margin: 0,
    padding: 0,
  },
  modalContent: {
    flex: 1,
    backgroundColor: 'black',
  },
  modalCloseArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  fullScreenImage: {
    width: width,
    height: height * 0.8,
  },
});
