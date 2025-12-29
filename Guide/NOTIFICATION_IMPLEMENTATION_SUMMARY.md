# Real-time Expense Notifications - Implementation Summary

## ✅ Implementation Complete

The real-time notification system has been fully implemented without Edge Functions. All notifications are created directly from the client-side service.

## What Was Implemented

### 1. **Notification Creation (Client-Side)**
- ✅ Direct notification creation in `notificationService.triggerExpenseNotifications()`
- ✅ Automatically called when expenses are created (both regular and food expenses)
- ✅ Creates two types of notifications:
  - `expense_added`: Notifies all group members about new expense
  - `expense_split_assigned`: Notifies users when split amount is assigned to them

### 2. **Notification Screen**
- ✅ Full notification list with read/unread indicators
- ✅ Mark as read (individual and all)
- ✅ Delete notifications
- ✅ Navigate to expense details on tap
- ✅ Pull to refresh
- ✅ Empty state handling

### 3. **Real-time Updates**
- ✅ WebSocket subscription to notifications table
- ✅ Instant UI updates when new notifications arrive
- ✅ Badge count updates automatically
- ✅ Push notifications when app is in background
- ✅ Local caching for offline support

### 4. **Navigation Integration**
- ✅ "Notifications" tab in bottom navigation
- ✅ Badge count indicator on tab icon
- ✅ Real-time badge updates

### 5. **Offline Sync**
- ✅ Notifications cached in AsyncStorage
- ✅ Read/delete actions queued for sync when offline
- ✅ Full sync when connection restored

### 6. **Push Notifications**
- ✅ Local push notifications with sound/vibration
- ✅ Navigation to expense details on tap
- ✅ Badge count on device icon

## Expo Push Notifications Setup

### Step 1: Add Push Token Columns to Database ⚠️ REQUIRED

**IMPORTANT**: You must run this SQL in your Supabase SQL Editor before push notifications will work.

Run this SQL in your Supabase database:

```sql
-- Add push_token columns to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS push_token TEXT;

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS push_token_updated_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_profiles_push_token ON profiles(push_token) 
WHERE push_token IS NOT NULL;
```

**Or use the provided SQL file**: `database/add_push_token_column.sql`

**How to run:**
1. Go to Supabase Dashboard
2. Navigate to SQL Editor
3. Copy and paste the SQL above (or from the file)
4. Click "Run" to execute

**Verify it worked:**
After running, you should see the columns in the table. The error "column profiles.push_token does not exist" should disappear.

### Step 2: Verify Expo Project ID

Your `app.json` already has the Expo project ID configured:
```json
"eas": {
  "projectId": "75672ee6-6961-4fc7-a57e-f04d11cb6dc6"
}
```

This is required for Expo push notifications to work.

### Step 3: How Push Notifications Work

1. **On App Start:**
   - App requests notification permissions
   - Gets Expo push token
   - Saves token to user's profile in database

2. **When Expense is Created:**
   - Notifications are created in database
   - Push notifications are sent via Expo Push API to all group members
   - Works even when app is closed

3. **Push Notification Types:**
   - **expense_added**: Sent to all group members (except creator)
   - **expense_split_assigned**: Sent to users with assigned split amounts

### Step 4: Testing Push Notifications

1. **Test on Physical Device:**
   - Push notifications only work on physical devices, not simulators
   - Build and install the app on a device

2. **Verify Token Registration:**
   - Check console logs for "Push token saved successfully"
   - Verify token is saved in `profiles.push_token` column

3. **Test Notification:**
   - Create an expense in a group
   - Close the app completely
   - Verify push notification is received

## Database Requirements

### Step 1: Update Notification Type Constraint

**IMPORTANT**: Run this SQL first to update the check constraint:

```sql
-- Fix the notification type check constraint
ALTER TABLE notifications 
DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications 
ADD CONSTRAINT notifications_type_check 
CHECK (type IN (
  'expense_added',
  'expense_split_assigned',
  'payment_received',
  'reminder',
  'group_invite'
));
```

Or use the provided SQL file: `database/fix_notification_type_constraint.sql`

### Step 2: Ensure Metadata Column Exists

```sql
-- Add metadata column if it doesn't exist
ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS metadata JSONB;
```

### Complete Table Structure

```sql
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('expense_added', 'expense_split_assigned', 'payment_received', 'reminder', 'group_invite')),
  is_read BOOLEAN DEFAULT FALSE,
  related_id UUID REFERENCES expenses(id) ON DELETE CASCADE,
  metadata JSONB,  -- IMPORTANT: This column must exist
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
```

## How It Works

### Expense Creation Flow:
1. User creates expense → `expenseService.createExpense()` or `foodExpenseService.createFoodExpense()`
2. Expense and splits are saved to database
3. `triggerExpenseNotifications()` is called automatically
4. Function fetches:
   - Expense details with splits and paid_by user info
   - All group members
5. Creates notifications for:
   - All members (except creator): "New Expense Added"
   - Members with split amounts: "Amount Assigned to You"
6. Notifications inserted into database
7. Real-time subscription broadcasts to all connected clients
8. Users receive instant notification updates

### Real-time Flow:
1. Notification inserted in database
2. Supabase Realtime broadcasts change via WebSocket
3. `useRealtimeNotifications` hook receives event
4. Notification added to Redux state
5. Badge count updates
6. Push notification sent (if app in background)
7. Notification cached locally

## Files Created/Modified

### New Files:
- `src/screens/main/NotificationsScreen.tsx` - Notification list screen
- `src/components/NotificationBadge.tsx` - Badge count component
- `src/components/NotificationInitializer.tsx` - App initialization component
- `database/create_notification_triggers.sql` - Optional database triggers (not used)

### Modified Files:
- `src/types/database.types.ts` - Added `expense_split_assigned` type and `metadata` field
- `src/services/supabase.service.ts` - Added notification creation logic
- `src/services/notifications.service.ts` - Enhanced push notification handling
- `src/store/slices/notificationsSlice.ts` - Added offline sync support
- `src/hooks/useRealtime.ts` - Enhanced real-time notification handling
- `src/navigation/AppNavigator.tsx` - Added Notifications tab with badge
- `src/services/sync.service.ts` - Added notification sync operations
- `App.tsx` - Added NotificationInitializer

## Testing Checklist

- [ ] Create an expense in a group → Verify notifications created for all members
- [ ] Check notification appears in real-time for other group members
- [ ] Verify badge count updates automatically
- [ ] Mark notification as read → Verify it updates
- [ ] Delete notification → Verify it's removed
- [ ] Tap notification → Verify navigation to expense details
- [ ] Test offline: Create expense offline → Verify notification synced when online
- [ ] Test push notification when app is in background
- [ ] Verify badge count on tab icon updates correctly

## Notes

- Notifications are created asynchronously and won't block expense creation if they fail
- The expense creator does not receive notifications for their own expenses
- Split notifications are only created for users with assigned amounts > 0
- All notifications are cached locally for offline access
- Badge count is updated both in-app and on device icon

