const { Supplier, InventoryItem, InventoryTransaction, Booking, Expense } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { buildSort, paginate, searchFilter, dateRangeFilter, escapeRegex } = require('../../utils/listQuery');
const { recordAudit } = require('../../services/audit');
const { getSystemSettings } = require('../../services/settings');
const { todayInTimeZone } = require('../../utils/dates');
const expensesService = require('../expenses/expenses.service');
const { INVENTORY_TRANSACTION_TYPES, labelOf, lineTotal, roundMoney } = require('../../config/shared');

const invalid = (field, message) => ApiError.unprocessable(message, [{ field, message }]);
const directionOf = (type) => INVENTORY_TRANSACTION_TYPES.find((entry) => entry.value === type).direction;
const round3 = (value) => Math.round(value * 1000) / 1000;

// ─── Suppliers ───────────────────────────────────────────────

async function listSuppliers(ctx, query) {
  const filter = {
    organizationId: ctx.organizationId,
    ...searchFilter(query.q, ['name', 'contactPerson', 'phone']),
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
  };
  const page = await paginate(Supplier, filter, { page: query.page, limit: query.limit, sort: buildSort(query.sort, { name: 'name' }, { name: 1 }) });
  const ids = page.data.map((supplier) => supplier._id);
  const [items, purchases] = await Promise.all([
    InventoryItem.aggregate([{ $match: { organizationId: ctx.organizationId, supplier: { $in: ids } } }, { $group: { _id: '$supplier', count: { $sum: 1 } } }]),
    Expense.aggregate([
      { $match: { organizationId: ctx.organizationId, supplier: { $in: ids }, void: { $exists: false } } },
      { $group: { _id: '$supplier', total: { $sum: '$amount' }, last: { $max: '$date' } } },
    ]),
  ]);
  const itemCount = new Map(items.map((row) => [String(row._id), row.count]));
  const spend = new Map(purchases.map((row) => [String(row._id), row]));
  page.data = page.data.map((supplier) => ({
    ...supplier,
    itemCount: itemCount.get(String(supplier._id)) ?? 0,
    totalPurchased: spend.get(String(supplier._id))?.total ?? 0,
    lastPurchase: spend.get(String(supplier._id))?.last ?? null,
  }));
  return page;
}

async function createSupplier(ctx, input) {
  const supplier = await Supplier.create({ ...input, organizationId: ctx.organizationId, createdBy: ctx.userId, updatedBy: ctx.userId });
  await recordAudit(ctx, { action: 'supplier.created', entity: { kind: 'supplier', id: supplier._id, label: supplier.name }, summary: `Added supplier ${supplier.name}` });
  return supplier.toJSON();
}

async function updateSupplier(ctx, id, input) {
  const supplier = await Supplier.findOneAndUpdate(
    { _id: id, organizationId: ctx.organizationId },
    { $set: { ...input, updatedBy: ctx.userId } },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  if (!supplier) throw ApiError.notFound('Supplier');
  return supplier;
}

async function removeSupplier(ctx, id) {
  const supplier = await Supplier.findOne({ _id: id, organizationId: ctx.organizationId });
  if (!supplier) throw ApiError.notFound('Supplier');
  const [items, movements, expenses] = await Promise.all([
    InventoryItem.exists({ organizationId: ctx.organizationId, supplier: supplier._id }),
    InventoryTransaction.exists({ organizationId: ctx.organizationId, supplier: supplier._id }),
    Expense.exists({ organizationId: ctx.organizationId, supplier: supplier._id }),
  ]);
  if (items || movements || expenses) throw ApiError.conflict(`${supplier.name} has purchase history. Mark the supplier inactive instead.`);
  await supplier.deleteOne();
  await recordAudit(ctx, { action: 'supplier.deleted', entity: { kind: 'supplier', id: supplier._id, label: supplier.name }, summary: `Deleted supplier ${supplier.name}` });
}

// ─── Items ───────────────────────────────────────────────────

const STOCK_STATUS_FILTERS = {
  out_of_stock: { currentQuantity: { $lte: 0 } },
  low_stock: { currentQuantity: { $gt: 0 }, $expr: { $lte: ['$currentQuantity', '$minimumQuantity'] } },
  in_stock: { $expr: { $gt: ['$currentQuantity', '$minimumQuantity'] }, currentQuantity: { $gt: 0 } },
};

function stockStatus(item) {
  if (item.currentQuantity <= 0) return 'out_of_stock';
  if (item.currentQuantity <= item.minimumQuantity) return 'low_stock';
  return 'in_stock';
}

const withStatus = (item) => ({ ...item, stockStatus: stockStatus(item), stockValue: roundMoney(item.currentQuantity * item.costPerUnit) });

async function listItems(ctx, query) {
  const filter = {
    organizationId: ctx.organizationId,
    ...searchFilter(query.q, ['name', 'sku', 'category', 'location']),
    ...(query.kind?.length ? { kind: { $in: query.kind } } : {}),
    ...(query.category ? { category: new RegExp(`^${escapeRegex(query.category)}$`, 'i') } : {}),
    ...(query.supplier ? { supplier: query.supplier } : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive } : { isActive: true }),
  };
  if (query.stockStatus?.length) filter.$or = query.stockStatus.map((status) => STOCK_STATUS_FILTERS[status]);

  const [page, [summary]] = await Promise.all([
    paginate(InventoryItem, filter, {
      page: query.page,
      limit: query.limit,
      sort: buildSort(query.sort, { name: 'name', sku: 'sku', currentQuantity: 'currentQuantity', category: 'category' }, { kind: 1, category: 1, name: 1 }),
      populate: { path: 'supplier', select: 'name' },
    }),
    InventoryItem.aggregate([
      { $match: { organizationId: ctx.organizationId, isActive: true } },
      {
        $group: {
          _id: null,
          items: { $sum: 1 },
          outOfStock: { $sum: { $cond: [{ $lte: ['$currentQuantity', 0] }, 1, 0] } },
          lowStock: { $sum: { $cond: [{ $and: [{ $gt: ['$currentQuantity', 0] }, { $lte: ['$currentQuantity', '$minimumQuantity'] }] }, 1, 0] } },
          stockValue: { $sum: { $multiply: ['$currentQuantity', '$costPerUnit'] } },
        },
      },
    ]),
  ]);
  return {
    ...page,
    data: page.data.map(withStatus),
    summary: { items: summary?.items ?? 0, lowStock: summary?.lowStock ?? 0, outOfStock: summary?.outOfStock ?? 0, stockValue: roundMoney(summary?.stockValue ?? 0) },
  };
}

async function listCategories(ctx) {
  const rows = await InventoryItem.aggregate([
    { $match: { organizationId: ctx.organizationId } },
    { $group: { _id: { kind: '$kind', category: '$category' }, count: { $sum: 1 } } },
    { $sort: { '_id.kind': 1, '_id.category': 1 } },
  ]);
  return rows.map((row) => ({ kind: row._id.kind, category: row._id.category, count: row.count }));
}

async function getItem(ctx, id) {
  const item = await InventoryItem.findOne({ _id: id, organizationId: ctx.organizationId }).populate('supplier', 'name phone').lean();
  if (!item) throw ApiError.notFound('Item');
  const recent = await InventoryTransaction.find({ organizationId: ctx.organizationId, item: item._id })
    .sort({ createdAt: -1 })
    .limit(15)
    .populate('supplier', 'name')
    .populate('booking', 'bookingNumber')
    .populate('createdBy', 'name')
    .lean();
  return { ...withStatus(item), recentTransactions: recent };
}

async function assertSupplier(ctx, supplierId, field = 'supplier') {
  if (supplierId && !(await Supplier.exists({ _id: supplierId, organizationId: ctx.organizationId }))) throw invalid(field, 'Choose a valid supplier');
}

async function createItem(ctx, input) {
  await assertSupplier(ctx, input.supplier);
  const { openingQuantity, ...fields } = input;
  const item = await InventoryItem.create({ ...fields, currentQuantity: 0, organizationId: ctx.organizationId, createdBy: ctx.userId, updatedBy: ctx.userId });
  await recordAudit(ctx, { action: 'inventory.item_created', entity: { kind: 'inventoryItem', id: item._id, label: item.name }, summary: `Added inventory item ${item.name} (${item.sku})` });
  if (openingQuantity > 0) {
    await recordTransaction(ctx, { item: item._id, type: 'stock_in', quantity: openingQuantity, unitCost: item.costPerUnit, notes: 'Opening stock', recordExpense: false });
  }
  return getItem(ctx, item._id);
}

async function updateItem(ctx, id, input) {
  await assertSupplier(ctx, input.supplier);
  const item = await InventoryItem.findOne({ _id: id, organizationId: ctx.organizationId });
  if (!item) throw ApiError.notFound('Item');
  const before = item.toJSON();
  item.set({ ...input, updatedBy: ctx.userId });
  await item.save();
  await recordAudit(ctx, { action: 'inventory.item_updated', entity: { kind: 'inventoryItem', id: item._id, label: item.name }, summary: `Updated inventory item ${item.name}`, before, after: item.toJSON() });
  return getItem(ctx, item._id);
}

async function removeItem(ctx, id) {
  const item = await InventoryItem.findOne({ _id: id, organizationId: ctx.organizationId });
  if (!item) throw ApiError.notFound('Item');
  if (await InventoryTransaction.exists({ organizationId: ctx.organizationId, item: item._id })) {
    throw ApiError.conflict(`${item.name} has stock history. Mark it inactive instead so the history is kept.`);
  }
  await item.deleteOne();
  await recordAudit(ctx, { action: 'inventory.item_deleted', entity: { kind: 'inventoryItem', id: item._id, label: item.name }, summary: `Deleted inventory item ${item.name}` });
}

// ─── Stock movements ─────────────────────────────────────────

/**
 * Applies the quantity change to the item atomically and returns { before, after }.
 * Removing stock only succeeds if enough is on hand; adjustments set the counted quantity.
 */
async function applyQuantityChange(ctx, item, type, quantity) {
  const scope = { _id: item._id, organizationId: ctx.organizationId };
  const direction = directionOf(type);

  if (direction === 0) {
    const before = await InventoryItem.findOneAndUpdate(scope, { $set: { currentQuantity: quantity } }, { returnDocument: 'before' }).lean();
    return { change: round3(quantity - before.currentQuantity), balanceAfter: quantity };
  }
  const change = round3(direction * quantity);
  const guard = direction < 0 ? { currentQuantity: { $gte: quantity } } : {};
  const after = await InventoryItem.findOneAndUpdate({ ...scope, ...guard }, { $inc: { currentQuantity: change } }, { returnDocument: 'after' }).lean();
  if (!after) {
    const current = await InventoryItem.findById(item._id).select('currentQuantity unit').lean();
    throw invalid('quantity', `Only ${current.currentQuantity} ${current.unit} of ${item.name} in stock`);
  }
  // Floating point dust from repeated fractional movements (e.g. 0.1 kg) is cleaned up here.
  if (after.currentQuantity !== round3(after.currentQuantity)) {
    await InventoryItem.updateOne(scope, { $set: { currentQuantity: round3(after.currentQuantity) } });
  }
  return { change, balanceAfter: round3(after.currentQuantity) };
}

/** Records a stock movement. Purchases can post an Inventory Purchase expense automatically. */
async function recordTransaction(ctx, input) {
  const item = await InventoryItem.findOne({ _id: input.item, organizationId: ctx.organizationId }).lean();
  if (!item) throw invalid('item', 'Choose a valid item');
  if (!item.isActive) throw invalid('item', `${item.name} is inactive`);
  await assertSupplier(ctx, input.supplier);
  if (input.booking && !(await Booking.exists({ _id: input.booking, organizationId: ctx.organizationId }))) throw invalid('booking', 'Choose a valid booking');

  const { timezone } = await getSystemSettings(ctx.organizationId);
  const date = input.date ?? todayInTimeZone(timezone);
  const unitCost = input.unitCost ?? item.costPerUnit;
  const isPurchase = input.type === 'purchase';
  const { change, balanceAfter } = await applyQuantityChange(ctx, item, input.type, input.quantity);

  let transaction;
  try {
    transaction = await InventoryTransaction.create({
      organizationId: ctx.organizationId,
      item: item._id,
      type: input.type,
      quantityChange: change,
      balanceAfter,
      unitCost,
      totalCost: lineTotal(Math.abs(change), unitCost),
      supplier: input.supplier ?? (isPurchase ? item.supplier : undefined),
      booking: input.booking,
      date,
      reference: input.reference,
      notes: input.notes,
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    });
  } catch (error) {
    await InventoryItem.updateOne({ _id: item._id }, { $inc: { currentQuantity: -change } });
    throw error;
  }

  if (isPurchase) {
    // The latest purchase price becomes the item's cost for stock valuation.
    await InventoryItem.updateOne({ _id: item._id }, { $set: { costPerUnit: unitCost, updatedBy: ctx.userId } });
    if (input.recordExpense && transaction.totalCost > 0) {
      const supplierId = transaction.supplier;
      const supplier = supplierId ? await Supplier.findById(supplierId).select('name').lean() : null;
      const expense = await expensesService.create(ctx, {
        categoryKey: 'inventory_purchase',
        amount: transaction.totalCost,
        date,
        description: `Purchase: ${input.quantity} ${item.unit} ${item.name}`,
        vendor: supplier?.name,
        supplier: supplierId,
        booking: input.booking,
        paymentMethod: input.paymentMethod,
        reference: input.reference,
        source: 'inventory_purchase',
        sourceRef: transaction._id,
      });
      transaction.expense = expense._id;
      await transaction.save();
    }
  }

  await recordAudit(ctx, {
    action: `inventory.${input.type}`,
    entity: { kind: 'inventoryItem', id: item._id, label: item.name },
    summary: `${labelOf(INVENTORY_TRANSACTION_TYPES, input.type)}: ${change > 0 ? '+' : ''}${change} ${item.unit} ${item.name} (now ${balanceAfter})`,
  });

  return InventoryTransaction.findById(transaction._id).populate('item', 'name unit sku').populate('expense', 'expenseNumber').lean();
}

async function listTransactions(ctx, query) {
  const filter = {
    organizationId: ctx.organizationId,
    ...(query.item ? { item: query.item } : {}),
    ...(query.type?.length ? { type: { $in: query.type } } : {}),
    ...(query.booking ? { booking: query.booking } : {}),
    ...(query.supplier ? { supplier: query.supplier } : {}),
    ...dateRangeFilter('date', query.from, query.to),
  };
  return paginate(InventoryTransaction, filter, {
    page: query.page,
    limit: query.limit,
    sort: buildSort(query.sort, { date: 'date', createdAt: 'createdAt' }, { date: -1, createdAt: -1 }),
    populate: [
      { path: 'item', select: 'name unit sku' },
      { path: 'supplier', select: 'name' },
      { path: 'booking', select: 'bookingNumber' },
      { path: 'expense', select: 'expenseNumber' },
      { path: 'createdBy', select: 'name' },
    ],
  });
}

/** Re-checks the cached quantity against the full ledger and repairs it if they differ. */
async function reconcile(ctx, id) {
  const item = await InventoryItem.findOne({ _id: id, organizationId: ctx.organizationId }).lean();
  if (!item) throw ApiError.notFound('Item');
  const [row] = await InventoryTransaction.aggregate([
    { $match: { organizationId: ctx.organizationId, item: item._id } },
    { $group: { _id: null, total: { $sum: '$quantityChange' } } },
  ]);
  const ledger = round3(row?.total ?? 0);
  const fixed = ledger !== item.currentQuantity;
  if (fixed) {
    await InventoryItem.updateOne({ _id: item._id }, { $set: { currentQuantity: Math.max(0, ledger) } });
    await recordAudit(ctx, {
      action: 'inventory.reconciled',
      entity: { kind: 'inventoryItem', id: item._id, label: item.name },
      summary: `Reconciled ${item.name}: ${item.currentQuantity} → ${ledger} ${item.unit}`,
    });
  }
  return { ledger, cached: item.currentQuantity, fixed };
}

module.exports = {
  listSuppliers,
  createSupplier,
  updateSupplier,
  removeSupplier,
  listItems,
  listCategories,
  getItem,
  createItem,
  updateItem,
  removeItem,
  recordTransaction,
  listTransactions,
  reconcile,
  stockStatus,
};
