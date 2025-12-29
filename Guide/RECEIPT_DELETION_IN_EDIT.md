# Receipt Deletion in Edit Expense - Fix

## Problem Solved ✅

**Issue:** When removing a receipt in the edit expense screen, the file remained in Supabase Storage bucket even though it was removed from the UI and database.

---

## Root Cause

The edit screen only cleared the UI state (`receiptUri` and `existingReceiptUrl`) but didn't:
1. Delete the file from Supabase Storage
2. Update the database to set `receipt_url` to `null`

---

## The Fix

### File: `src/screens/forms/EditExpenseScreen.tsx`

Added comprehensive receipt deletion logic in the `handleSubmit` function:

#### 1. **Track Deletion Intent**

```typescript
let shouldDeleteOldReceipt = false;

if (receiptUri) {
  // New receipt selected - will replace old one
  if (existingReceiptUrl) {
    shouldDeleteOldReceipt = true;
  }
} else if (!receiptUri && !existingReceiptUrl && selectedExpense?.receipt_url) {
  // User removed the receipt - delete from storage
  shouldDeleteOldReceipt = true;
}
```

#### 2. **Delete from Storage**

```typescript
// Delete old receipt if needed (before updating expense)
if (shouldDeleteOldReceipt && selectedExpense?.receipt_url) {
  try {
    await expenseService.deleteReceipt(selectedExpense.receipt_url);
    console.log('✅ Old receipt deleted from storage');
  } catch (error) {
    console.error('Failed to delete old receipt:', error);
    // Continue anyway - don't block the update
  }
}
```

#### 3. **Update Database**

```typescript
updates: {
  category_id: selectedCategoryId,
  description: description.trim(),
  amount: amountNum,
  date: format(selectedDate, 'yyyy-MM-dd'),
  notes: notes.trim() || null,
  split_type: splitType,
  // Set receipt_url to null if user removed it
  ...(!receiptUri && !existingReceiptUrl && selectedExpense?.receipt_url 
    ? { receipt_url: null } 
    : {}),
}
```

---

## How It Works

### Scenario 1: User Removes Receipt

**Flow:**
```
1. User clicks X button on receipt preview
   ↓
2. receiptUri = null
   existingReceiptUrl = null
   ↓
3. User clicks "Update Expense"
   ↓
4. shouldDeleteOldReceipt = true
   ↓
5. Delete file from storage
   ↓
6. Update database: receipt_url = null
   ↓
7. ✅ Receipt removed from storage AND database
```

**Result:**
- ✅ File deleted from Supabase Storage
- ✅ Database updated: `receipt_url = null`
- ✅ No orphaned files

---

### Scenario 2: User Replaces Receipt

**Flow:**
```
1. User selects new receipt image
   ↓
2. receiptUri = new URI
   existingReceiptUrl still has old URL
   ↓
3. User clicks "Update Expense"
   ↓
4. shouldDeleteOldReceipt = true
   ↓
5. Delete OLD file from storage
   ↓
6. Upload NEW file to storage
   ↓
7. Update database: receipt_url = new URL
   ↓
8. ✅ Old receipt deleted, new receipt uploaded
```

**Result:**
- ✅ Old file deleted from storage
- ✅ New file uploaded to storage
- ✅ Database updated with new URL
- ✅ No orphaned files

---

### Scenario 3: User Keeps Existing Receipt

**Flow:**
```
1. User doesn't touch receipt
   ↓
2. receiptUri = null
   existingReceiptUrl = existing URL
   ↓
3. User clicks "Update Expense"
   ↓
4. shouldDeleteOldReceipt = false
   ↓
5. No deletion, no upload
   ↓
6. Database unchanged
   ↓
7. ✅ Receipt remains intact
```

**Result:**
- ✅ File stays in storage
- ✅ Database unchanged
- ✅ Receipt preserved

---

## Logic Breakdown

### When to Delete Old Receipt?

```typescript
shouldDeleteOldReceipt = true when:

1. New receipt selected AND existing receipt exists
   (receiptUri && existingReceiptUrl)
   
2. User removed receipt
   (!receiptUri && !existingReceiptUrl && selectedExpense?.receipt_url)
```

### When to Set receipt_url to null?

```typescript
receipt_url = null when:

User removed receipt:
(!receiptUri && !existingReceiptUrl && selectedExpense?.receipt_url)
```

---

## Error Handling

### Storage Deletion Fails

```typescript
try {
  await expenseService.deleteReceipt(selectedExpense.receipt_url);
  console.log('✅ Old receipt deleted from storage');
} catch (error) {
  console.error('Failed to delete old receipt:', error);
  // Continue anyway - don't block the update
}
```

**Behavior:**
- Logs error but doesn't throw
- Expense update continues
- User sees success message
- File remains in storage (orphaned)

**Why?**
- Receipt deletion is cleanup
- Shouldn't block main operation
- Better UX (user's intent succeeds)

---

## Testing

### Test Receipt Removal

1. **Edit expense with existing receipt**
2. **Click X to remove receipt**
3. **Click "Update Expense"**
4. **Check terminal:**
   ```
   ✅ Old receipt deleted from storage
   ```
5. **Check Supabase Storage:**
   - ✅ File should be gone
6. **Check database:**
   - ✅ `receipt_url` should be `null`

### Test Receipt Replacement

1. **Edit expense with existing receipt**
2. **Upload new receipt**
3. **Click "Update Expense"**
4. **Check terminal:**
   ```
   ✅ Old receipt deleted from storage
   📸 Starting receipt upload...
   ✅ Receipt uploaded to storage
   ```
5. **Check Supabase Storage:**
   - ✅ Old file gone
   - ✅ New file present
6. **Check database:**
   - ✅ `receipt_url` updated to new URL

---

## Console Logs

### Success (Removal):
```
✅ Old receipt deleted from storage
Expense updated successfully!
```

### Success (Replacement):
```
✅ Old receipt deleted from storage
📸 Starting receipt upload...
✅ Image fetched successfully
📦 Image size: 765058 bytes
✅ Receipt uploaded to storage
✅ Signed URL created
Expense updated successfully!
```

### Error (Deletion Failed):
```
Failed to delete old receipt: [error details]
Expense updated successfully!
```

---

## Benefits

### Before Fix:
- ❌ Files orphaned in storage
- ❌ Storage costs increase
- ❌ Clutter in bucket
- ❌ Database has old URL

### After Fix:
- ✅ Files properly deleted
- ✅ Storage stays clean
- ✅ No orphaned files
- ✅ Database accurate

---

## Related Features

This fix complements:
1. ✅ Delete expense → Deletes receipt
2. ✅ Edit expense → **Now deletes old receipt**
3. ✅ Create expense → Uploads receipt
4. ✅ View receipt → Shows receipt

**Complete receipt lifecycle management!** 🎉

---

## Summary

✅ **Fixed:** Receipt deletion in edit expense  
✅ **Deletes:** Old receipt from storage when removed  
✅ **Updates:** Database to set receipt_url to null  
✅ **Handles:** Both removal and replacement  
✅ **Prevents:** Orphaned files in storage  

**Receipts are now properly managed throughout their lifecycle!** 🗑️✨
