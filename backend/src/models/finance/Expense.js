const { Schema, model } = require('mongoose');
const tenantPlugin = require('../plugins/tenant');
const { voidSchema, fileSchema } = require('../plugins/commonSchemas');
const { values } = require('../../config/shared');

const expenseSchema = new Schema(
  {
    expenseNumber: { type: String, required: true, immutable: true },
    category: { type: Schema.Types.ObjectId, ref: 'ExpenseCategory', required: true },
    amount: { type: Number, required: true, min: 0.01 },
    date: { type: Date, required: true },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    vendor: { type: String, trim: true, maxlength: 120 },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    paymentMethod: { type: String, enum: values.paymentMethods, default: 'cash' },
    reference: { type: String, trim: true, maxlength: 100 },
    receipt: { type: fileSchema },
    // Link to an event so its cost counts against that event's profit.
    booking: { type: Schema.Types.ObjectId, ref: 'Booking' },
    staff: { type: Schema.Types.ObjectId, ref: 'Staff' },
    // Where this expense came from. Automatic expenses can only be changed through their source.
    source: { type: String, enum: values.expenseSources, default: 'manual', immutable: true },
    sourceRef: { type: Schema.Types.ObjectId, immutable: true },
    void: { type: voidSchema },
  },
  { timestamps: true },
);

expenseSchema.plugin(tenantPlugin);
expenseSchema.index({ organizationId: 1, expenseNumber: 1 }, { unique: true });
expenseSchema.index({ organizationId: 1, date: -1 });
expenseSchema.index({ organizationId: 1, category: 1, date: -1 });
expenseSchema.index({ organizationId: 1, booking: 1 });
expenseSchema.index({ organizationId: 1, staff: 1 });

expenseSchema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'], { document: false, query: true }, function blockDelete() {
  throw new Error('An expense cannot be deleted — void it instead');
});

module.exports = model('Expense', expenseSchema);
