# Quick Testing Guide - Offline Functionality

## 🚀 Quick Start Testing

### Step 1: Prepare (Online)
1. Open the app
2. Log in
3. Navigate through all screens:
   - Dashboard
   - Groups → Create a group
   - Expenses → Add an expense
   - Personal Finance → Add a transaction
   - Messages → Send a message
4. Wait 5 seconds for data to cache

### Step 2: Go Offline
**Mobile:**
- Enable Airplane Mode

**Web:**
- Chrome DevTools (F12) → Network tab → Check "Offline"

### Step 3: Test Offline
1. Close and reopen the app
2. Navigate to all screens - **Data should appear instantly!**
3. Create new items:
   - Add expense → Should work!
   - Create group → Should work!
   - Send message → Should work!
4. Edit/Delete items → Should work!

### Step 4: Go Online
**Mobile:**
- Disable Airplane Mode

**Web:**
- Uncheck "Offline" in DevTools

### Step 5: Verify Sync
- Wait 2-3 seconds
- Check that offline items sync automatically
- Temporary IDs should be replaced
- Success toasts should appear

## ✅ What Should Work Offline

- ✅ View all cached data
- ✅ Create expenses
- ✅ Create groups
- ✅ Add personal transactions
- ✅ Send messages
- ✅ Edit items
- ✅ Delete items
- ✅ Navigate all screens
- ✅ See error states with retry buttons

## 🎯 Key Indicators

**Offline Toast Messages:**
- "Expense saved offline. Will sync when connection is restored."
- "Group saved offline. Will sync when connection is restored."
- "Message saved offline. Will send when connection is restored."

**Online Toast Messages:**
- "Expense added successfully!"
- "Group created successfully!"
- "Message sent!"

**Visual:**
- Offline indicator (red dot) when offline
- Online indicator (green dot) when online
- Instant data loading (no spinner)
- Retry buttons on errors

## 🐛 Troubleshooting

**No data offline?**
→ Make sure you opened app online first and navigated through screens

**Items not syncing?**
→ Wait 2-3 seconds after going online, or pull to refresh

**Stuck loading?**
→ Should not happen - all loading states clear properly

## 📱 Platform-Specific

**iOS:**
- Settings → Airplane Mode

**Android:**
- Quick Settings → Airplane Mode

**Web:**
- Chrome DevTools → Network → Offline checkbox

---

**For detailed testing, see `OFFLINE_TESTING_GUIDE.md`**

