# Issues Fixed - Summary Report
**Date:** 2025-12-28
**Session:** Terminal Error Resolution

## Overview
This document summarizes the issues found in the terminal and the fixes applied.

---

## ✅ Issue 1: Deprecated ImagePicker API
**Status:** FIXED ✓

### Problem
The app was using the deprecated `ImagePicker.MediaTypeOptions.Images` API, which was causing warnings:
```
WARN [expo-image-picker] `ImagePicker.MediaTypeOptions` have been deprecated. 
Use `ImagePicker.MediaType` or an array of `ImagePicker.MediaType` instead.
```

### Solution
Updated all instances to use the new array-based API:
- **Before:** `mediaTypes: ImagePicker.MediaTypeOptions.Images`
- **After:** `mediaTypes: ['images']`

### Files Modified
1. `src/screens/forms/AddExpenseScreen.tsx` (line 130)
2. `src/screens/forms/EditExpenseScreen.tsx` (line 124)
3. `src/screens/forms/AddPersonalTransactionScreen.tsx` (line 98)

---

## ✅ Issue 2: Receipt Upload RLS Policy Violation
**Status:** FIXED ✓

### Problem
Receipt uploads were failing with:
```
ERROR Receipt upload error: [StorageApiError: new row violates row-level security policy]
```

This occurred because:
1. The file path didn't include the user ID
2. Supabase Storage RLS policies require user ID in the path for security

### Solution
**Code Changes:**
- Updated `src/services/supabase.service.ts` (lines 1451-1482)
- Changed file path from `{fileName}` to `{userId}/{fileName}`
- Example: `receipts/1234567890_receipt.jpg` → `receipts/739c26c3-1bc9-4ab6-a32b-7543156f4a05/1234567890_receipt.jpg`

**Database Changes:**
- Created SQL script: `database/storage_receipts_policies.sql`
- This script sets up proper RLS policies for the receipts bucket

### Action Required
You need to run the SQL script in your Supabase SQL Editor:
```bash
# File location:
database/storage_receipts_policies.sql
```

**Steps:**
1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `storage_receipts_policies.sql`
4. Execute the script

---

## ✅ Issue 3: Category Null Constraint Violation
**Status:** FIXED ✓

### Problem
When creating group expenses, a personal transaction was automatically created, but the category was null:
```
ERROR null value in column "category" of relation "personal_transactions" 
violates not-null constraint
```

### Root Cause
The code tried to find a category from `personalCategories`, but:
1. If categories weren't loaded yet, the array was empty
2. If no matching category existed, `defaultCat` was `undefined`
3. This resulted in `category_id: undefined` → database null → constraint violation

### Solution
Updated `src/store/slices/expensesSlice.ts` (lines 158-183):

**Improvements:**
1. ✅ Check if `personalCategories` exists and has items
2. ✅ Try multiple category names: 'Group', 'Others', or any expense category
3. ✅ Validate that `defaultCat.id` exists before creating transaction
4. ✅ Log warnings when categories aren't available (won't crash the app)
5. ✅ Added proper TypeScript type annotation (`type: 'expense' as const`)

**Behavior:**
- If categories are available → Creates personal transaction with valid category
- If categories are NOT available → Skips personal transaction creation, logs warning
- Group expense still gets created successfully in both cases

---

## Summary of Changes

### Files Modified
1. ✅ `src/screens/forms/AddExpenseScreen.tsx`
2. ✅ `src/screens/forms/EditExpenseScreen.tsx`
3. ✅ `src/screens/forms/AddPersonalTransactionScreen.tsx`
4. ✅ `src/services/supabase.service.ts`
5. ✅ `src/store/slices/expensesSlice.ts`

### Files Created
1. ✅ `database/storage_receipts_policies.sql` (SQL script for Supabase)

---

## Testing Recommendations

### 1. Test ImagePicker Deprecation Fix
- ✅ Open the app and try to upload a receipt
- ✅ Check terminal - no more deprecation warnings should appear

### 2. Test Receipt Upload
**Prerequisites:** Run the SQL script first!

- ✅ Create a new expense with a receipt
- ✅ Verify the receipt uploads successfully
- ✅ Check that the receipt URL is accessible
- ✅ Verify the file path in Supabase Storage includes the user ID

### 3. Test Category Validation
- ✅ Create a group expense
- ✅ Check that personal transaction is created with valid category
- ✅ Check terminal for any warnings about missing categories
- ✅ Verify no database constraint errors

---

## Next Steps

### Immediate Action Required
1. **Run the SQL script** in Supabase Dashboard:
   - File: `database/storage_receipts_policies.sql`
   - This will fix the receipt upload RLS policies

### Optional Improvements
1. **Ensure Personal Categories are Loaded Early**
   - Consider loading personal categories when the app starts
   - This ensures they're available when creating group expenses

2. **Create a "Group" Category**
   - Add a default "Group" category in your personal finance categories
   - This will be used for automatic personal transaction tracking

3. **Monitor Logs**
   - Watch for the new warning messages about missing categories
   - These indicate when automatic personal finance tracking is skipped

---

## Technical Details

### Receipt Upload Path Structure
```
Before: receipts/{fileName}
After:  receipts/{userId}/{fileName}

Example:
receipts/739c26c3-1bc9-4ab6-a32b-7543156f4a05/1735407600000_receipt.jpg
```

### RLS Policy Logic
```sql
-- Users can only upload to their own folder
WITH CHECK (
  bucket_id = 'receipts' AND
  (storage.foldername(name))[1] = auth.uid()::text
)
```

### Category Selection Priority
1. Try to find 'Group' category (type: expense)
2. Try to find 'Others' category (type: expense)
3. Use first expense category found
4. If none found → Skip personal transaction creation

---

## Conclusion

All three issues have been resolved:
- ✅ ImagePicker deprecation warnings eliminated
- ✅ Receipt upload RLS policy violation fixed (requires SQL script execution)
- ✅ Category null constraint violation prevented

The app should now run without these errors. Make sure to execute the SQL script to complete the receipt upload fix!
