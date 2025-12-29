# Edit Expense Receipt Upload - React Native File Fix

## Problem
When editing an expense and uploading a receipt, the app crashed with error:
```
ReferenceError: Property 'blob' doesn't exist
```

## Root Cause
The code was trying to use a web `File` object API, but React Native uses a different file structure with `uri`, `name`, and `type` properties instead of `blob`.

---

## What Was Fixed

### File: `src/store/slices/expensesSlice.ts`

#### Changes Made:

1. **Replaced File Upload Method**
   - **Before:** Used `uploadReceipt(filePath, file)` which expected web File object
   - **After:** Used `fetch(receipt.uri)` + `arrayBuffer()` approach (React Native compatible)

2. **Added Supabase Import**
   - Imported `supabase` from `'../../services/supabase'`
   - Needed for direct storage upload

3. **Fixed Type Definition**
   - **Before:** `receipt?: File | null`
   - **After:** `receipt?: any` (React Native file object)

4. **Matched createExpense Approach**
   - Now uses same upload logic as create expense
   - Consistent across the codebase

---

## How It Works Now

### Upload Process:

1. ✅ Get file URI from ImagePicker
2. ✅ Fetch the file using `fetch(receipt.uri)`
3. ✅ Convert to `arrayBuffer()`
4. ✅ Create `Uint8Array` from buffer
5. ✅ Upload to Supabase Storage
6. ✅ Generate signed URL
7. ✅ Save URL to database

### Code Flow:

```typescript
// Get file from React Native
const receipt = { uri: 'file://...', name: 'receipt.jpg', type: 'image/jpeg' };

// Fetch the file
const response = await fetch(receipt.uri);
const arrayBuffer = await response.arrayBuffer();
const uint8Array = new Uint8Array(arrayBuffer);

// Upload to storage
await supabase.storage
  .from('receipts')
  .upload(filePath, uint8Array, {
    contentType: receipt.type,
    cacheControl: '3600',
    upsert: false
  });
```

---

## Differences: Web vs React Native

### Web File Object:
```javascript
{
  name: 'receipt.jpg',
  type: 'image/jpeg',
  size: 12345,
  blob: Blob { ... },  // ❌ Doesn't exist in React Native
  arrayBuffer: () => Promise<ArrayBuffer>
}
```

### React Native File Object:
```javascript
{
  uri: 'file:///path/to/receipt.jpg',  // ✅ React Native specific
  name: 'receipt.jpg',
  type: 'image/jpeg',
  size: 12345
}
```

---

## Redux Non-Serializable Warning

You might see this warning:
```
A non-serializable value was detected in an action, in the path: `meta.arg.receipt`
```

**This is expected and safe to ignore because:**
- The file object is only used during the async operation
- It's not stored in Redux state
- The warning is for development only
- Production builds have this check disabled

**To suppress the warning (optional):**
You can configure Redux Toolkit to ignore this path in your store configuration.

---

## Testing

### Test Receipt Upload in Edit

1. **Edit an expense**
2. **Add/replace a receipt**
3. **Save**
4. **Verify:**
   - ✅ No "blob doesn't exist" error
   - ✅ Receipt uploads successfully
   - ✅ Receipt displays in expense details
   - ✅ File appears in Supabase Storage

---

## Error Handling

### Success Path:
```
Fetching image...
Converting to arrayBuffer...
Uploading to storage...
Creating signed URL...
✅ Receipt uploaded successfully
```

### Failure Paths:

**Fetch Fails:**
```
ERROR: Failed to fetch image
→ Shows error to user
→ Expense not updated
```

**Upload Fails:**
```
ERROR: Receipt upload error: [details]
→ Shows error to user
→ Expense not updated
```

**Signed URL Fails:**
```
ERROR: Failed to create signed URL
→ Shows error to user
→ Expense not updated
```

---

## Related Files

### Modified:
- ✅ `src/store/slices/expensesSlice.ts` - Fixed upload logic and types

### Uses Same Approach:
- ✅ `src/services/supabase.service.ts` - createExpense function

---

## Summary

✅ **Fixed:** React Native file upload compatibility  
✅ **Removed:** Web File object dependency  
✅ **Added:** Proper fetch + arrayBuffer approach  
✅ **Matched:** createExpense implementation  
✅ **Result:** Edit expense receipt upload now works!  

**The "blob doesn't exist" error is completely resolved!** 🎉
