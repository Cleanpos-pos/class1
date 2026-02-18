# Driver Portal Task Display Fix

## Issue
Orders marked as "ready_for_delivery" and assigned to drivers for delivery were incorrectly showing as "COLLECTION" tasks instead of "DELIVERY" tasks in the Driver Portal.

## Root Cause
The driver portal was determining whether a task was a COLLECTION or DELIVERY based on which `driver_id` field matched (`collection_driver_id` vs `delivery_driver_id`), rather than based on the order's current workflow stage.

### Problem Example:
```
Order Status: ready_for_delivery
Driver Assigned: delivery_driver_id = Paul Robinson
Driver Portal Showed: "COLLECTION" ❌ (Wrong!)
Should Show: "DELIVERY" ✅
```

## Solution
Updated the logic to determine task type based on the **order's workflow stage** (status field) rather than driver assignment fields.

### New Logic:

**Collection Phase:**
- Status: `pending`, `dispatched`, `collecting`
- Shows as: **COLLECTION** task (Blue)

**Delivery Phase:**
- Status: `ready_for_delivery`, `out_for_delivery`, `delivered`
- Shows as: **DELIVERY** task (Green)

## Changes Made

### 1. Updated `fetchDeliveries()` Function
**File:** `App.tsx` (Line ~3170)

**Before:**
```typescript
// Fetched all orders where driver was assigned
// Didn't filter by workflow stage
const { data } = await supabase
  .from('cp_orders')
  .select('*')
  .or(`collection_driver_id.eq.${driver.id},delivery_driver_id.eq.${driver.id}`)
  .not('collection_status', 'eq', 'collected')
  .not('delivery_status', 'eq', 'delivered');
```

**After:**
```typescript
// Fetch orders and filter by workflow stage
const { data } = await supabase
  .from('cp_orders')
  .select('*')
  .or(`collection_driver_id.eq.${driver.id},delivery_driver_id.eq.${driver.id}`)
  .not('status', 'eq', 'completed');

// Filter to show only relevant tasks
const relevantDeliveries = data.filter(order => {
  const isCollectionDriver = order.collection_driver_id === driver.id;
  const isDeliveryDriver = order.delivery_driver_id === driver.id;
  
  const inCollectionPhase = ['pending', 'dispatched', 'collecting'].includes(order.status);
  const inDeliveryPhase = ['ready_for_delivery', 'out_for_delivery', 'delivered'].includes(order.status);
  
  return (isCollectionDriver && inCollectionPhase) || (isDeliveryDriver && inDeliveryPhase);
});
```

### 2. Updated Task Type Display Logic
**File:** `App.tsx` (Line ~3359)

**Before:**
```typescript
const isCollection = delivery.collection_driver_id === driver.id;
const orderType = isCollection ? 'COLLECTION' : 'DELIVERY';
```

**After:**
```typescript
// Determine based on workflow stage
const inCollectionPhase = ['pending', 'dispatched', 'collecting'].includes(delivery.status);
const isCollection = inCollectionPhase;
const orderType = isCollection ? 'COLLECTION' : 'DELIVERY';
```

### 3. Updated Order Details Panel
**File:** `App.tsx` (Line ~3428)

Applied the same workflow-based logic to the order details panel.

## Workflow Stages

### Complete Order Lifecycle:
```
1. pending           → New order
2. dispatched        → COLLECTION: Driver dispatched
3. collecting        → COLLECTION: Driver collecting
4. collected         → Items at facility
5. cleaning          → Being processed
6. ready_for_delivery → Ready to send back
7. out_for_delivery  → DELIVERY: Driver dispatched
8. delivered         → DELIVERY: Items delivered
9. completed         → Order closed
```

### Driver Portal Views:

**Collection Tasks (Blue):**
- pending
- dispatched
- collecting

**Delivery Tasks (Green):**
- ready_for_delivery
- out_for_delivery
- delivered

## Testing

### Test Scenario:
1. **Back Office:** Mark order as "Ready for Delivery"
2. **Back Office:** Click "Deliver" button (status → out_for_delivery)
3. **Driver Portal:** Login as assigned driver
4. **Expected Result:** Order shows as "DELIVERY" task (Green) ✅
5. **Previous Result:** Order showed as "COLLECTION" task (Blue) ❌

### Verification Steps:
1. Create new order
2. Assign driver for collection
3. **Driver sees:** COLLECTION task (Blue)
4. Complete collection
5. Back office marks as "Ready for Delivery"
6. Back office clicks "Deliver"
7. **Driver sees:** DELIVERY task (Green) ✅

## Benefits

✅ **Correct Task Type** - Drivers see accurate task labels
✅ **Workflow-Based** - Logic follows actual order workflow
✅ **Color Coded** - Blue for collection, Green for delivery
✅ **Filtered List** - Drivers only see relevant tasks
✅ **Real-Time Sync** - Updates automatically via Supabase Realtime

## Status Mapping

| Order Status | Driver Sees | Color | Task Type |
|--------------|-------------|-------|-----------|
| pending | COLLECTION | Blue | Collection |
| dispatched | COLLECTION | Blue | Collection |
| collecting | COLLECTION | Blue | Collection |
| collected | *(Not shown)* | - | - |
| cleaning | *(Not shown)* | - | - |
| ready_for_delivery | DELIVERY | Green | Delivery |
| out_for_delivery | DELIVERY | Green | Delivery |
| delivered | DELIVERY | Green | Delivery |
| completed | *(Not shown)* | - | - |

## Notes

- Orders in `collected`, `cleaning`, and `completed` status are not shown in driver portal
- Drivers only see tasks relevant to their current workflow stage
- Real-time updates ensure drivers always see current status
- Color coding helps drivers quickly identify task type

---

**Status:** ✅ Fixed and Deployed
**Issue:** Resolved
**Application:** Running at http://localhost:3000/
