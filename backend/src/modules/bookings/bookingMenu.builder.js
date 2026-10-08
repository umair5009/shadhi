const { MenuPackage, MenuItem } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { lineTotal } = require('../../config/shared');

const invalid = (field, message) => ApiError.unprocessable(message, [{ field, message }]);

/** Default quantity for a dish line: per-person dishes scale with guests, everything else starts at 1. */
function defaultQuantity(unit, guestCount) {
  return unit === 'per_person' || unit === 'per_plate' ? guestCount : 1;
}

async function loadMenuItems(ctx, ids) {
  const items = await MenuItem.find({ _id: { $in: ids }, organizationId: ctx.organizationId }).populate('category', 'name').lean();
  return new Map(items.map((item) => [String(item._id), item]));
}

/**
 * Builds priced lines from { menuItem, quantity?, unitPrice? } input.
 * Lines already on the booking keep their snapshot if the dish was later deleted from the catalogue.
 */
async function buildLines(ctx, inputLines, { source, guestCount, priceFor, existingLines, field }) {
  const catalogue = await loadMenuItems(ctx, inputLines.map((line) => line.menuItem));
  const previous = new Map((existingLines ?? []).filter((line) => line.menuItem).map((line) => [String(line.menuItem), line]));
  const warnings = [];

  const lines = inputLines.map((line, index) => {
    const item = catalogue.get(String(line.menuItem));
    const snapshot = previous.get(String(line.menuItem));
    if (!item && !snapshot) throw invalid(`${field}.${index}.menuItem`, 'One of the selected dishes no longer exists');
    if (item && !item.isAvailable && !snapshot) warnings.push(`${item.name} is marked as unavailable`);

    const unit = item?.unit ?? snapshot.unit;
    const quantity = line.quantity ?? snapshot?.quantity ?? defaultQuantity(unit, guestCount);
    const unitPrice = line.unitPrice ?? snapshot?.unitPrice ?? priceFor(item);
    return {
      menuItem: line.menuItem,
      name: item?.name ?? snapshot.name,
      category: item?.category?.name ?? snapshot?.category,
      source,
      unit,
      quantity,
      unitPrice,
      total: lineTotal(quantity, unitPrice),
    };
  });
  return { lines, warnings };
}

/**
 * Turns the booking form's menu input into the stored BookingMenu.
 * Package bookings freeze the package name, pricing and included dishes at the time of booking; if the booking is
 * edited later with the same package, the original snapshot is kept so later catalogue changes don't alter what the
 * customer agreed to.
 *
 * @returns {Promise<{ menu: object, warnings: string[] }>}
 */
async function buildBookingMenu(ctx, input, guestCount, existingMenu) {
  if (!input || input.mode === 'none') {
    return { menu: { mode: 'none', items: [], notes: input?.notes }, warnings: [] };
  }

  if (input.mode === 'custom') {
    const { lines, warnings } = await buildLines(ctx, input.items ?? [], {
      source: 'custom',
      guestCount,
      priceFor: (item) => item.price,
      existingLines: existingMenu?.items,
      field: 'menu.items',
    });
    return { menu: { mode: 'custom', items: lines, notes: input.notes }, warnings };
  }

  // Package mode
  const warnings = [];
  const samePackage = existingMenu?.mode === 'package' && String(existingMenu.package?.ref) === String(input.package);
  let packageSnapshot;
  let includedLines;
  let optionalPrices = new Map();

  const pkg = await MenuPackage.findOne({ _id: input.package, organizationId: ctx.organizationId }).populate({
    path: 'items.menuItem',
    select: 'name unit price category',
    populate: { path: 'category', select: 'name' },
  });

  if (samePackage) {
    packageSnapshot = { ...existingMenu.package, rate: input.rate ?? existingMenu.package.rate };
    includedLines = existingMenu.items.filter((line) => line.source === 'package');
  } else {
    if (!pkg || !pkg.isActive) throw invalid('menu.package', 'This package is not available');
    packageSnapshot = { ref: pkg._id, name: pkg.name, pricingType: pkg.pricingType, rate: input.rate ?? pkg.price };
    includedLines = pkg.items
      .filter((entry) => !entry.isOptional && entry.menuItem)
      .map((entry) => ({
        menuItem: entry.menuItem._id,
        name: entry.menuItem.name,
        category: entry.menuItem.category?.name,
        source: 'package',
        unit: entry.menuItem.unit,
        quantity: 0,
        unitPrice: 0,
        total: 0,
      }));
  }
  if (pkg) {
    optionalPrices = new Map(pkg.items.filter((entry) => entry.isOptional && entry.menuItem).map((entry) => [String(entry.menuItem._id), entry.extraPrice]));
    if (pkg.minGuests && guestCount < pkg.minGuests) warnings.push(`${pkg.name} is normally for at least ${pkg.minGuests} guests`);
  }

  const { lines: extraLines, warnings: extraWarnings } = await buildLines(ctx, input.extras ?? [], {
    source: 'extra',
    guestCount,
    // An optional dish of the package costs its package extra price; any other dish costs its menu price.
    priceFor: (item) => optionalPrices.get(String(item._id)) ?? item.price,
    existingLines: existingMenu?.items?.filter((line) => line.source === 'extra'),
    field: 'menu.extras',
  });

  return {
    menu: { mode: 'package', package: packageSnapshot, items: [...includedLines, ...extraLines], notes: input.notes },
    warnings: [...warnings, ...extraWarnings],
  };
}

module.exports = { buildBookingMenu };
