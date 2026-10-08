const { Schema, model } = require('mongoose');
const tenantPlugin = require('../plugins/tenant');
const { moneyField } = require('../plugins/commonSchemas');
const { values } = require('../../config/shared');

const inventoryItemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    kind: { type: String, enum: values.inventoryKinds, required: true },
    category: { type: String, required: true, trim: true, maxlength: 60 },
    sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    unit: { type: String, enum: values.inventoryUnits, required: true },
    // Cached running balance of the transaction ledger. Only changed by inventory.service (atomically).
    currentQuantity: { type: Number, default: 0, min: 0 },
    minimumQuantity: { type: Number, default: 0, min: 0 },
    costPerUnit: moneyField(),
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    location: { type: String, trim: true, maxlength: 100 },
    notes: { type: String, trim: true, maxlength: 1000 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

inventoryItemSchema.plugin(tenantPlugin);
inventoryItemSchema.index({ organizationId: 1, sku: 1 }, { unique: true });
inventoryItemSchema.index({ organizationId: 1, kind: 1, category: 1 });
inventoryItemSchema.index({ organizationId: 1, name: 1 });

inventoryItemSchema.virtual('stockStatus').get(function stockStatus() {
  if (this.currentQuantity <= 0) return 'out_of_stock';
  if (this.currentQuantity <= this.minimumQuantity) return 'low_stock';
  return 'in_stock';
});

module.exports = model('InventoryItem', inventoryItemSchema);
