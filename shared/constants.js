// Enums shared by the API (validation, models) and the web app (forms, labels).
// Each list is [{ value, label }] so both sides render the same wording.

const toValues = (list) => list.map((entry) => entry.value);

export const EVENT_TYPES = [
  { value: 'wedding', label: 'Wedding' },
  { value: 'mehndi', label: 'Mehndi' },
  { value: 'baraat', label: 'Baraat' },
  { value: 'walima', label: 'Walima' },
  { value: 'engagement', label: 'Engagement' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'corporate', label: 'Corporate Event' },
  { value: 'other', label: 'Other' },
];

export const BOOKING_STATUSES = [
  { value: 'inquiry', label: 'Inquiry', description: 'Customer asked about a date — nothing reserved yet' },
  { value: 'tentative', label: 'Tentative', description: 'Date held for the customer, not yet confirmed' },
  { value: 'confirmed', label: 'Confirmed', description: 'Hall is reserved for this event' },
  { value: 'completed', label: 'Completed', description: 'Event has taken place' },
  { value: 'cancelled', label: 'Cancelled', description: 'Booking was cancelled (kept for records)' },
];

// Statuses that actually occupy the hall. Two of these may never overlap.
export const BLOCKING_BOOKING_STATUSES = ['confirmed', 'completed'];

// Statuses that represent an event that is still going to happen.
export const OPEN_BOOKING_STATUSES = ['inquiry', 'tentative', 'confirmed'];

export const BOOKING_STATUS_TRANSITIONS = {
  inquiry: ['tentative', 'confirmed', 'cancelled'],
  tentative: ['inquiry', 'confirmed', 'cancelled'],
  confirmed: ['tentative', 'completed', 'cancelled'],
  completed: ['confirmed'],
  cancelled: ['tentative'],
};

export const PAYMENT_STATUSES = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partial', label: 'Partially paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'overpaid', label: 'Overpaid' },
];

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'jazzcash', label: 'JazzCash' },
  { value: 'easypaisa', label: 'EasyPaisa' },
  { value: 'card', label: 'Card' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
];

export const PAYMENT_TYPES = [
  { value: 'advance', label: 'Advance' },
  { value: 'installment', label: 'Installment' },
  { value: 'final', label: 'Final Payment' },
  { value: 'refund', label: 'Refund' },
];

export const MENU_UNITS = [
  { value: 'per_person', label: 'Per person' },
  { value: 'per_plate', label: 'Per plate' },
  { value: 'per_dish', label: 'Per dish' },
  { value: 'per_kg', label: 'Per kg' },
  { value: 'per_piece', label: 'Per piece' },
  { value: 'per_litre', label: 'Per litre' },
];

export const PACKAGE_PRICING_TYPES = [
  { value: 'per_person', label: 'Per person' },
  { value: 'fixed', label: 'Fixed price' },
];

export const BOOKING_MENU_MODES = [
  { value: 'package', label: 'Package' },
  { value: 'custom', label: 'Custom menu' },
  { value: 'none', label: 'No food' },
];

export const HALL_FACILITIES = [
  { value: 'parking', label: 'Parking' },
  { value: 'generator', label: 'Generator' },
  { value: 'ac', label: 'Air conditioning' },
  { value: 'stage', label: 'Stage' },
  { value: 'sound_system', label: 'Sound system' },
  { value: 'lighting', label: 'Lighting' },
  { value: 'bridal_room', label: 'Bridal room' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'outdoor_area', label: 'Outdoor area' },
];

export const HALL_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'maintenance', label: 'Under maintenance' },
  { value: 'inactive', label: 'Inactive' },
];

export const INVENTORY_KINDS = [
  { value: 'food', label: 'Food & kitchen' },
  { value: 'equipment', label: 'Equipment' },
];

// direction: +1 adds stock, -1 removes stock, 0 sets an absolute counted quantity
export const INVENTORY_TRANSACTION_TYPES = [
  { value: 'purchase', label: 'Purchase', direction: 1 },
  { value: 'stock_in', label: 'Stock in', direction: 1 },
  { value: 'stock_out', label: 'Stock out', direction: -1 },
  { value: 'damaged', label: 'Damaged / lost', direction: -1 },
  { value: 'adjustment', label: 'Stock count adjustment', direction: 0 },
];

export const INVENTORY_UNITS = [
  { value: 'kg', label: 'Kilogram (kg)' },
  { value: 'g', label: 'Gram (g)' },
  { value: 'litre', label: 'Litre' },
  { value: 'piece', label: 'Piece' },
  { value: 'dozen', label: 'Dozen' },
  { value: 'pack', label: 'Pack' },
  { value: 'crate', label: 'Crate' },
  { value: 'bottle', label: 'Bottle' },
  { value: 'set', label: 'Set' },
  { value: 'bag', label: 'Bag' },
];

export const DEFAULT_EXPENSE_CATEGORIES = [
  { key: 'food', name: 'Food' },
  { key: 'electricity', name: 'Electricity' },
  { key: 'gas', name: 'Gas' },
  { key: 'water', name: 'Water' },
  { key: 'staff', name: 'Staff' },
  { key: 'salary', name: 'Salary' },
  { key: 'maintenance', name: 'Maintenance' },
  { key: 'decoration', name: 'Decoration' },
  { key: 'marketing', name: 'Marketing' },
  { key: 'rent', name: 'Rent' },
  { key: 'cleaning', name: 'Cleaning' },
  { key: 'transportation', name: 'Transportation' },
  { key: 'equipment', name: 'Equipment' },
  { key: 'inventory_purchase', name: 'Inventory Purchase' },
  { key: 'other', name: 'Other' },
];

export const EXPENSE_SOURCES = [
  { value: 'manual', label: 'Entered manually' },
  { value: 'inventory_purchase', label: 'Inventory purchase' },
  { value: 'salary', label: 'Salary payment' },
];

export const STAFF_POSITIONS = [
  { value: 'manager', label: 'Manager' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'receptionist', label: 'Receptionist' },
  { value: 'waiter', label: 'Waiter' },
  { value: 'chef', label: 'Chef' },
  { value: 'cleaner', label: 'Cleaner' },
  { value: 'security', label: 'Security' },
  { value: 'driver', label: 'Driver' },
  { value: 'other', label: 'Other' },
];

export const STAFF_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'on_leave', label: 'On leave' },
  { value: 'terminated', label: 'Left / terminated' },
];

export const ATTENDANCE_STATUSES = [
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'half_day', label: 'Half day' },
  { value: 'leave', label: 'On leave' },
  { value: 'absent', label: 'Absent' },
];

export const values = {
  eventTypes: toValues(EVENT_TYPES),
  bookingStatuses: toValues(BOOKING_STATUSES),
  paymentStatuses: toValues(PAYMENT_STATUSES),
  paymentMethods: toValues(PAYMENT_METHODS),
  paymentTypes: toValues(PAYMENT_TYPES),
  menuUnits: toValues(MENU_UNITS),
  packagePricingTypes: toValues(PACKAGE_PRICING_TYPES),
  bookingMenuModes: toValues(BOOKING_MENU_MODES),
  hallFacilities: toValues(HALL_FACILITIES),
  hallStatuses: toValues(HALL_STATUSES),
  inventoryKinds: toValues(INVENTORY_KINDS),
  inventoryTransactionTypes: toValues(INVENTORY_TRANSACTION_TYPES),
  inventoryUnits: toValues(INVENTORY_UNITS),
  expenseSources: toValues(EXPENSE_SOURCES),
  staffPositions: toValues(STAFF_POSITIONS),
  staffStatuses: toValues(STAFF_STATUSES),
  attendanceStatuses: toValues(ATTENDANCE_STATUSES),
};

export function labelOf(list, value) {
  return list.find((entry) => entry.value === value)?.label ?? value ?? '';
}
