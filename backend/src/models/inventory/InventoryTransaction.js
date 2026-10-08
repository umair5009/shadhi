const { Schema, model } = require('mongoose');
const tenantPlugin = require('../plugins/tenant');
const immutablePlugin = require('../plugins/immutable');
const { moneyField } = require('../plugins/commonSchemas');
const { values } = require('../../config/shared');

// Stock ledger. The item's currentQuantity is the running sum of quantityChange.
const inventoryTransactionSchema = new Schema(
  {
    item: { type: Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
    type: { type: String, enum: values.inventoryTransactionTypes, required: true },
    quantityChange: { type: Number, required: true },
    balanceAfter: { type: Number, required: true, min: 0 },
    unitCost: moneyField(),
    totalCost: moneyField(),
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    booking: { type: Schema.Types.ObjectId, ref: 'Booking' },
    expense: { type: Schema.Types.ObjectId, ref: 'Expense' },
    date: { type: Date, required: true },
    reference: { type: String, trim: true, maxlength: 100 },
    notes: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true },
);

inventoryTransactionSchema.plugin(tenantPlugin);
inventoryTransactionSchema.plugin(immutablePlugin, { allowedPaths: ['expense'], label: 'A stock movement' });
inventoryTransactionSchema.index({ organizationId: 1, item: 1, createdAt: -1 });
inventoryTransactionSchema.index({ organizationId: 1, date: -1 });
inventoryTransactionSchema.index({ organizationId: 1, type: 1, date: -1 });

module.exports = model('InventoryTransaction', inventoryTransactionSchema);
