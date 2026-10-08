const { MenuCategory, MenuItem, MenuPackage, Booking } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { buildSort, paginate, searchFilter, dateRangeFilter } = require('../../utils/listQuery');
const { recordAudit } = require('../../services/audit');
const storage = require('../../services/storage');

const invalid = (field, message) => ApiError.unprocessable(message, [{ field, message }]);

// ─── Categories ──────────────────────────────────────────────

async function listCategories(ctx) {
  const [categories, counts] = await Promise.all([
    MenuCategory.find({ organizationId: ctx.organizationId }).sort({ sortOrder: 1, name: 1 }).lean(),
    MenuItem.aggregate([{ $match: { organizationId: ctx.organizationId } }, { $group: { _id: '$category', count: { $sum: 1 } } }]),
  ]);
  const byCategory = new Map(counts.map((row) => [String(row._id), row.count]));
  return categories.map((category) => ({ ...category, itemCount: byCategory.get(String(category._id)) ?? 0 }));
}

async function createCategory(ctx, input) {
  const category = await MenuCategory.create({ ...input, organizationId: ctx.organizationId, createdBy: ctx.userId, updatedBy: ctx.userId });
  await recordAudit(ctx, { action: 'menu.category_created', entity: { kind: 'menuCategory', id: category._id, label: category.name }, summary: `Added menu category ${category.name}` });
  return category.toJSON();
}

async function updateCategory(ctx, id, input) {
  const category = await MenuCategory.findOneAndUpdate(
    { _id: id, organizationId: ctx.organizationId },
    { $set: { ...input, updatedBy: ctx.userId } },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  if (!category) throw ApiError.notFound('Category');
  return category;
}

async function removeCategory(ctx, id) {
  const category = await MenuCategory.findOne({ _id: id, organizationId: ctx.organizationId });
  if (!category) throw ApiError.notFound('Category');
  const items = await MenuItem.countDocuments({ organizationId: ctx.organizationId, category: category._id });
  if (items) throw ApiError.conflict(`${category.name} still has ${items} dish(es). Move or delete them first.`);
  await category.deleteOne();
  await recordAudit(ctx, { action: 'menu.category_deleted', entity: { kind: 'menuCategory', id: category._id, label: category.name }, summary: `Deleted menu category ${category.name}` });
}

// ─── Items ───────────────────────────────────────────────────

async function assertCategory(ctx, categoryId) {
  if (!(await MenuCategory.exists({ _id: categoryId, organizationId: ctx.organizationId }))) throw invalid('category', 'Choose a valid category');
}

async function listItems(ctx, query) {
  const filter = {
    organizationId: ctx.organizationId,
    ...searchFilter(query.q, ['name', 'description', 'ingredients']),
    ...(query.category ? { category: query.category } : {}),
    ...(query.isAvailable !== undefined ? { isAvailable: query.isAvailable } : {}),
  };
  return paginate(MenuItem, filter, {
    page: query.page,
    limit: query.limit,
    sort: buildSort(query.sort, { name: 'name', price: 'price', createdAt: 'createdAt' }, { name: 1 }),
    populate: { path: 'category', select: 'name' },
  });
}

async function getItem(ctx, id) {
  const item = await MenuItem.findOne({ _id: id, organizationId: ctx.organizationId }).populate('category', 'name').lean();
  if (!item) throw ApiError.notFound('Dish');
  const packages = await MenuPackage.find({ organizationId: ctx.organizationId, 'items.menuItem': item._id }).select('name isActive').lean();
  return { ...item, packages };
}

async function createItem(ctx, input) {
  await assertCategory(ctx, input.category);
  const item = await MenuItem.create({ ...input, organizationId: ctx.organizationId, createdBy: ctx.userId, updatedBy: ctx.userId });
  await recordAudit(ctx, { action: 'menu.item_created', entity: { kind: 'menuItem', id: item._id, label: item.name }, summary: `Added dish ${item.name}` });
  return getItem(ctx, item._id);
}

async function updateItem(ctx, id, input) {
  if (input.category) await assertCategory(ctx, input.category);
  const item = await MenuItem.findOne({ _id: id, organizationId: ctx.organizationId });
  if (!item) throw ApiError.notFound('Dish');
  const before = item.toJSON();
  item.set({ ...input, updatedBy: ctx.userId });
  await item.save();
  await recordAudit(ctx, { action: 'menu.item_updated', entity: { kind: 'menuItem', id: item._id, label: item.name }, summary: `Updated dish ${item.name}`, before, after: item.toJSON() });
  return getItem(ctx, item._id);
}

async function removeItem(ctx, id) {
  const item = await MenuItem.findOne({ _id: id, organizationId: ctx.organizationId });
  if (!item) throw ApiError.notFound('Dish');
  const packages = await MenuPackage.find({ organizationId: ctx.organizationId, 'items.menuItem': item._id }).select('name').lean();
  if (packages.length) {
    throw ApiError.conflict(`${item.name} is part of ${packages.map((pkg) => pkg.name).join(', ')}. Remove it from those packages or mark it unavailable instead.`);
  }
  await item.deleteOne();
  if (item.image?.key) await storage.removeFile(item.image.key);
  await recordAudit(ctx, { action: 'menu.item_deleted', entity: { kind: 'menuItem', id: item._id, label: item.name }, summary: `Deleted dish ${item.name}` });
}

async function setItemImage(ctx, id, file) {
  if (!file) throw ApiError.badRequest('Choose an image to upload');
  const item = await MenuItem.findOne({ _id: id, organizationId: ctx.organizationId });
  if (!item) throw ApiError.notFound('Dish');
  const previousKey = item.image?.key;
  item.image = await storage.saveFile(ctx.organizationId, file, { imagesOnly: true });
  item.updatedBy = ctx.userId;
  await item.save();
  if (previousKey) await storage.removeFile(previousKey);
  return getItem(ctx, item._id);
}

// ─── Packages ────────────────────────────────────────────────

const PACKAGE_POPULATE = {
  path: 'items.menuItem',
  select: 'name price unit isAvailable category',
  populate: { path: 'category', select: 'name sortOrder' },
};

async function assertPackageItems(ctx, items) {
  if (!items?.length) return;
  const ids = items.map((item) => item.menuItem);
  const found = await MenuItem.countDocuments({ organizationId: ctx.organizationId, _id: { $in: ids } });
  if (found !== new Set(ids.map(String)).size) throw invalid('items', 'One of the selected dishes does not exist');
}

async function listPackages(ctx, { includeInactive }) {
  const packages = await MenuPackage.find({ organizationId: ctx.organizationId, ...(includeInactive ? {} : { isActive: true }) })
    .sort({ isActive: -1, price: 1 })
    .populate(PACKAGE_POPULATE)
    .lean();
  const usage = await Booking.aggregate([
    { $match: { organizationId: ctx.organizationId, 'menu.mode': 'package', status: { $ne: 'cancelled' } } },
    { $group: { _id: '$menu.package.ref', bookings: { $sum: 1 } } },
  ]);
  const byPackage = new Map(usage.map((row) => [String(row._id), row.bookings]));
  return packages.map((pkg) => ({ ...pkg, bookingCount: byPackage.get(String(pkg._id)) ?? 0 }));
}

async function getPackage(ctx, id) {
  const pkg = await MenuPackage.findOne({ _id: id, organizationId: ctx.organizationId }).populate(PACKAGE_POPULATE).lean();
  if (!pkg) throw ApiError.notFound('Package');
  return pkg;
}

async function createPackage(ctx, input) {
  await assertPackageItems(ctx, input.items);
  const pkg = await MenuPackage.create({ ...input, organizationId: ctx.organizationId, createdBy: ctx.userId, updatedBy: ctx.userId });
  await recordAudit(ctx, { action: 'menu.package_created', entity: { kind: 'menuPackage', id: pkg._id, label: pkg.name }, summary: `Created package ${pkg.name}` });
  return getPackage(ctx, pkg._id);
}

async function updatePackage(ctx, id, input) {
  await assertPackageItems(ctx, input.items);
  const pkg = await MenuPackage.findOne({ _id: id, organizationId: ctx.organizationId });
  if (!pkg) throw ApiError.notFound('Package');
  const before = pkg.toJSON();
  pkg.set({ ...input, updatedBy: ctx.userId });
  await pkg.save();
  await recordAudit(ctx, { action: 'menu.package_updated', entity: { kind: 'menuPackage', id: pkg._id, label: pkg.name }, summary: `Updated package ${pkg.name}`, before, after: pkg.toJSON() });
  return getPackage(ctx, pkg._id);
}

/** Packages already used by bookings are archived (hidden) rather than deleted. */
async function removePackage(ctx, id) {
  const pkg = await MenuPackage.findOne({ _id: id, organizationId: ctx.organizationId });
  if (!pkg) throw ApiError.notFound('Package');
  const used = await Booking.exists({ organizationId: ctx.organizationId, 'menu.package.ref': pkg._id });
  if (used) {
    pkg.set({ isActive: false, updatedBy: ctx.userId });
    await pkg.save();
    await recordAudit(ctx, { action: 'menu.package_archived', entity: { kind: 'menuPackage', id: pkg._id, label: pkg.name }, summary: `Archived package ${pkg.name}` });
    return { archived: true };
  }
  await pkg.deleteOne();
  await recordAudit(ctx, { action: 'menu.package_deleted', entity: { kind: 'menuPackage', id: pkg._id, label: pkg.name }, summary: `Deleted package ${pkg.name}` });
  return { archived: false };
}

// ─── Usage ───────────────────────────────────────────────────

/** Most-served dishes and most-chosen packages across non-cancelled events. */
async function usage(ctx, { from, to }) {
  const match = { organizationId: ctx.organizationId, status: { $ne: 'cancelled' }, ...dateRangeFilter('eventDate', from, to) };
  const [dishes, packages] = await Promise.all([
    Booking.aggregate([
      { $match: match },
      { $unwind: '$menu.items' },
      {
        $group: {
          _id: { $ifNull: ['$menu.items.menuItem', '$menu.items.name'] },
          name: { $last: '$menu.items.name' },
          category: { $last: '$menu.items.category' },
          events: { $sum: 1 },
          guestsServed: { $sum: '$guestCount' },
          extraRevenue: { $sum: '$menu.items.total' },
        },
      },
      { $sort: { events: -1, guestsServed: -1 } },
      { $limit: 25 },
    ]),
    Booking.aggregate([
      { $match: { ...match, 'menu.mode': 'package' } },
      {
        $group: {
          _id: '$menu.package.ref',
          name: { $last: '$menu.package.name' },
          events: { $sum: 1 },
          guests: { $sum: '$guestCount' },
          menuRevenue: { $sum: '$totals.menu' },
        },
      },
      { $sort: { events: -1 } },
    ]),
  ]);
  return { dishes, packages };
}

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  removeCategory,
  listItems,
  getItem,
  createItem,
  updateItem,
  removeItem,
  setItemImage,
  listPackages,
  getPackage,
  createPackage,
  updatePackage,
  removePackage,
  usage,
};
