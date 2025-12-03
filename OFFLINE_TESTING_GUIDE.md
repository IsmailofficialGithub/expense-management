# Offline-First Testing Guide

This guide explains how to test the offline-first functionality of the Expense Management App.

## Overview

The app now works completely offline:
- ✅ All data is cached locally
- ✅ You can view cached data without internet
- ✅ You can create/edit/delete items offline
- ✅ Changes sync automatically when connection is restored
- ✅ Loading states are properly handled
- ✅ Error states show retry buttons

## Prerequisites

1. **Install the app** on your device or emulator
2. **Log in** to your account (requires internet initially)
3. **Create some test data** while online:
   - Create a group
   - Add some expenses
   - Add personal transactions
   - Send some messages

## Testing Methods

### Method 1: Airplane Mode (Recommended)

**Best for: Mobile devices (iOS/Android)**

1. **Prepare:**
   - Open the app while online
   - Navigate through different screens to ensure data is cached
   - Wait a few seconds for initial cache to populate

2. **Enable Airplane Mode:**
   - iOS: Settings → Airplane Mode (ON)
   - Android: Quick Settings → Airplane Mode (ON)
   - Or use the device's airplane mode toggle

3. **Test Offline Functionality:**
   - Close and reopen the app
   - Navigate to different screens
   - Try creating new items
   - Verify data is still visible

4. **Disable Airplane Mode:**
   - Turn off airplane mode
   - Wait 1-2 seconds
   - Verify sync happens automatically

### Method 2: Disable WiFi/Data

**Best for: All platforms**

1. **While Online:**
   - Open the app and let it load data
   - Navigate through screens

2. **Disable Network:**
   - Turn off WiFi
   - Turn off mobile data (if on mobile)
   - Or disconnect from network

3. **Test Offline:**
   - Use the app normally
   - Create/edit/delete items
   - Verify offline indicators appear

4. **Re-enable Network:**
   - Turn WiFi/data back on
   - Verify automatic sync

### Method 3: Developer Tools (Web)

**Best for: Web browser testing**

1. **Open Chrome DevTools:**
   - Press `F12` or `Ctrl+Shift+I` (Windows/Linux)
   - Press `Cmd+Option+I` (Mac)

2. **Go to Network Tab:**
   - Click "Network" tab
   - Check "Offline" checkbox
   - Or use throttling: Select "Offline" from dropdown

3. **Test Offline:**
   - Refresh the page
   - Use the app
   - Verify offline behavior

4. **Go Online:**
   - Uncheck "Offline"
   - Verify sync happens

### Method 4: Network Throttling (Mobile)

**Best for: Simulating slow/unstable connections**

1. **iOS Simulator:**
   - Device → Network Link Conditioner
   - Select "100% Loss" for offline
   - Or select "Very Bad Network" for slow connection

2. **Android Emulator:**
   - Settings → Network & Internet → Mobile network
   - Or use extended controls (⋯) → Cellular → Signal strength → None

## Test Scenarios

### ✅ Test 1: View Cached Data Offline

**Steps:**
1. Open app while online
2. Navigate to Dashboard, Groups, Expenses, Personal Finance, Messages
3. Enable airplane mode
4. Close and reopen the app
5. Navigate to all screens again

**Expected Result:**
- ✅ All screens load instantly
- ✅ Previously viewed data is visible
- ✅ No "No internet connection" errors
- ✅ Data appears immediately (no loading spinner)

---

### ✅ Test 2: Create Expense Offline

**Steps:**
1. Enable airplane mode
2. Go to Groups screen
3. Select a group
4. Click "Add Expense"
5. Fill in expense details
6. Click "Save"

**Expected Result:**
- ✅ Expense form works normally
- ✅ Success toast: "Expense saved offline. Will sync when connection is restored."
- ✅ Expense appears in the list immediately
- ✅ Expense has a temporary ID (starts with "temp-")

**After Reconnecting:**
- ✅ Expense syncs automatically
- ✅ Temporary ID is replaced with real ID
- ✅ Success toast: "Expense added successfully!"

---

### ✅ Test 3: Create Group Offline

**Steps:**
1. Enable airplane mode
2. Go to Groups screen
3. Click "New Group" (FAB)
4. Enter group name and description
5. Click "Create"

**Expected Result:**
- ✅ Group is created successfully
- ✅ Toast: "Group saved offline. Will sync when connection is restored."
- ✅ Group appears in list immediately

**After Reconnecting:**
- ✅ Group syncs automatically
- ✅ Group is visible to other users

---

### ✅ Test 4: Send Message Offline

**Steps:**
1. Enable airplane mode
2. Go to Messages screen
3. Open a conversation
4. Type a message
5. Send the message

**Expected Result:**
- ✅ Message appears immediately (optimistic update)
- ✅ Message shows as "pending" or has temporary ID
- ✅ Toast: "Message saved offline. Will send when connection is restored."

**After Reconnecting:**
- ✅ Message syncs automatically
- ✅ Message is delivered to recipient
- ✅ Temporary message is replaced with real one

---

### ✅ Test 5: Edit Expense Offline

**Steps:**
1. Enable airplane mode
2. Go to Expenses screen
3. Open an existing expense
4. Click "Edit"
5. Modify expense details
6. Save changes

**Expected Result:**
- ✅ Changes are saved locally
- ✅ Updated expense appears in list
- ✅ Toast confirms offline save

**After Reconnecting:**
- ✅ Changes sync to server
- ✅ Other users see updated expense

---

### ✅ Test 6: Delete Item Offline

**Steps:**
1. Enable airplane mode
2. Go to Personal Finance screen
3. Delete a transaction
4. Confirm deletion

**Expected Result:**
- ✅ Item is removed from list immediately
- ✅ Toast: "Transaction deleted successfully"
- ✅ Deletion is queued for sync

**After Reconnecting:**
- ✅ Deletion syncs to server
- ✅ Item is permanently deleted

---

### ✅ Test 7: Automatic Sync on Reconnect

**Steps:**
1. Create several items offline (expenses, groups, messages)
2. Make some edits
3. Delete some items
4. Re-enable network connection

**Expected Result:**
- ✅ Sync starts automatically within 1-2 seconds
- ✅ All pending changes sync in order
- ✅ Success toasts appear for synced items
- ✅ Temporary IDs are replaced with real IDs
- ✅ No data loss

---

### ✅ Test 8: Error Handling & Retry

**Steps:**
1. Enable airplane mode
2. Try to load a screen that requires data
3. If error occurs, check for retry button
4. Click retry button

**Expected Result:**
- ✅ Error message is displayed clearly
- ✅ Retry/Refresh button is visible
- ✅ Clicking retry attempts to reload
- ✅ Loading state is cleared even on error

---

### ✅ Test 9: Background Sync

**Steps:**
1. Create items offline
2. Minimize the app
3. Re-enable network
4. Wait 10-15 seconds
5. Reopen the app

**Expected Result:**
- ✅ Items have synced in background
- ✅ No manual refresh needed
- ✅ Data is up to date

---

### ✅ Test 10: Multiple Screens Offline

**Steps:**
1. Enable airplane mode
2. Navigate through all screens:
   - Dashboard
   - Groups
   - Expenses
   - Personal Finance
   - Messages
   - Profile
   - Payment Methods

**Expected Result:**
- ✅ All screens load from cache
- ✅ No blocking "No internet" messages
- ✅ Data is visible immediately
- ✅ All features work offline

---

## Visual Indicators

### Online Status Indicator

Look for the **Offline Indicator** component:
- **Green dot**: Online
- **Red dot**: Offline
- Usually appears in header or status bar

### Toast Messages

**Online:**
- "Expense added successfully!"
- "Group created successfully!"
- "Message sent!"

**Offline:**
- "Expense saved offline. Will sync when connection is restored."
- "Group saved offline. Will sync when connection is restored."
- "Message saved offline. Will send when connection is restored."

### Loading States

- **Loading spinner**: Data is being fetched
- **No spinner**: Data loaded from cache (instant)
- **Error state**: Shows error message with retry button

---

## Troubleshooting

### Issue: Data not appearing offline

**Solution:**
1. Make sure you opened the app while online first
2. Navigate through screens to populate cache
3. Wait a few seconds for cache to save
4. Then go offline

### Issue: Changes not syncing

**Solution:**
1. Check network connection is restored
2. Wait 2-3 seconds for automatic sync
3. Pull to refresh on the screen
4. Check sync queue in Redux DevTools (if available)

### Issue: Temporary IDs not replaced

**Solution:**
1. Ensure network is connected
2. Wait for sync to complete (check for success toasts)
3. Refresh the screen
4. Temporary IDs should be replaced automatically

### Issue: Duplicate items after sync

**Solution:**
1. This should not happen, but if it does:
2. Check sync queue for duplicates
3. Clear app cache and re-sync
4. Report as a bug

---

## Advanced Testing

### Check Sync Queue

If you have Redux DevTools installed:

1. Open Redux DevTools
2. Look for `sync/queue` in state
3. Verify pending operations are queued
4. Watch queue clear after sync

### Monitor Network Requests

**Chrome DevTools:**
1. Open Network tab
2. Go offline
3. Perform actions
4. Go online
5. Watch requests fire automatically

**React Native Debugger:**
1. Enable network inspection
2. Monitor API calls
3. Verify offline operations are queued
4. Verify sync happens on reconnect

---

## Test Checklist

Use this checklist to ensure all features work offline:

- [ ] Dashboard loads cached data
- [ ] Groups list loads from cache
- [ ] Expenses list loads from cache
- [ ] Personal Finance loads from cache
- [ ] Messages/Conversations load from cache
- [ ] Create expense offline
- [ ] Create group offline
- [ ] Create personal transaction offline
- [ ] Send message offline
- [ ] Edit expense offline
- [ ] Delete item offline
- [ ] Automatic sync on reconnect
- [ ] Error states show retry buttons
- [ ] Loading states clear properly
- [ ] Temporary IDs replaced after sync
- [ ] No data loss during sync
- [ ] Background sync works
- [ ] All screens work offline

---

## Tips for Testing

1. **Start Fresh:** Clear app data before testing to see cache population
2. **Test Gradually:** Test one feature at a time
3. **Use Real Data:** Create meaningful test data
4. **Test Edge Cases:** 
   - Very slow connections
   - Intermittent connections
   - Multiple offline operations
   - Large amounts of data
5. **Monitor Performance:** Check app doesn't slow down with cached data
6. **Test on Different Devices:** iOS, Android, Web may behave differently

---

## Success Criteria

✅ **App works completely offline**
✅ **All data is cached and accessible**
✅ **Changes sync automatically**
✅ **No data loss**
✅ **Good user experience**
✅ **Clear offline indicators**
✅ **Proper error handling**

---

## Need Help?

If you encounter issues:
1. Check console logs for errors
2. Verify network status
3. Clear app cache and retry
4. Check Redux state in DevTools
5. Review sync queue status

---

**Happy Testing! 🚀**

