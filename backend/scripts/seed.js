// Development seed: a realistic wedding hall business so every screen has data on first run.
// Everything is created through the real services, so business rules (totals, conflicts, numbering, expense
// postings) hold for seeded data exactly as for data entered in the app.
//
//   npm run seed            (drops the database named in MONGODB_URI first)

const mongoose = require('mongoose');
const env = require('../src/config/env');
const models = require('../src/models');
const { connectDatabase, disconnectDatabase } = require('../src/config/db');
const { createOrganization } = require('../src/modules/organizations/organization.service');
const { buildContext } = require('../src/middleware/authenticate');
const { invalidateSettings } = require('../src/services/settings');
const { todayInTimeZone, addDays, formatDateOnly, toDateOnly, zonedDateTimeToUtc } = require('../src/utils/dates');
const bcrypt = require('bcryptjs');

const hallsService = require('../src/modules/halls/halls.service');
const customersService = require('../src/modules/customers/customers.service');
const menuService = require('../src/modules/menu/menu.service');
const bookingsService = require('../src/modules/bookings/bookings.service');
const paymentsService = require('../src/modules/payments/payments.service');
const invoicesService = require('../src/modules/invoices/invoices.service');
const expensesService = require('../src/modules/expenses/expenses.service');
const inventoryService = require('../src/modules/inventory/inventory.service');
const staffService = require('../src/modules/staff/staff.service');

const TIMEZONE = 'Asia/Karachi';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@shadihall.pk';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';
const DEMO_PASSWORD = 'Demo@12345';

// Deterministic pseudo-random numbers so every seed produces the same business.
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(20260928);
const pick = (list) => list[Math.floor(random() * list.length)];
const roundTo = (value, step) => Math.round(value / step) * step;

const today = todayInTimeZone(TIMEZONE);
const day = (offset) => addDays(today, offset);
const minDate = (a, b) => (a < b ? a : b);

/** Backdates createdAt so "new this month" and history views look realistic. */
async function backdate(model, id, date) {
  await model.collection.updateOne({ _id: id }, { $set: { createdAt: zonedDateTimeToUtc(formatDateOnly(date), '11:00', TIMEZONE) } });
}

// ─── Data ────────────────────────────────────────────────────

const HALLS = [
  { name: 'Crystal Hall', capacity: 600, basePrice: 250000, hourlyPrice: 40000, color: '#7A1F3D', facilities: ['parking', 'generator', 'ac', 'stage', 'sound_system', 'lighting', 'bridal_room', 'kitchen'], description: 'Our flagship air-conditioned banquet hall with chandeliers, a raised stage and a private bridal suite.' },
  { name: 'Garden Marquee', capacity: 1000, basePrice: 350000, hourlyPrice: 55000, color: '#2F7D5B', facilities: ['parking', 'generator', 'stage', 'sound_system', 'lighting', 'kitchen', 'outdoor_area'], description: 'Open-air lawn with a weather-proof marquee — ideal for large mehndi and walima functions.' },
  { name: 'Emerald Room', capacity: 200, basePrice: 90000, hourlyPrice: 15000, color: '#B8862B', facilities: ['parking', 'generator', 'ac', 'sound_system', 'lighting'], description: 'An intimate room for engagements, birthdays and corporate dinners.' },
];

const MENU = {
  Rice: [['Chicken Biryani', 380], ['Mutton Pulao', 520], ['Kabuli Pulao', 450], ['Plain Rice', 120]],
  Chicken: [['Chicken Karahi', 420], ['Chicken Qorma', 380], ['Chicken Handi', 440], ['Chicken Jalfrezi', 400]],
  Mutton: [['Mutton Qorma', 680], ['Mutton Karahi', 750], ['Beef Nihari', 480], ['Mutton Chanay', 560]],
  BBQ: [['Seekh Kabab', 260], ['Chicken Tikka', 320], ['Malai Boti', 340], ['Mutton Chops', 650], ['Fish Tikka', 480]],
  'Salads & Raita': [['Fresh Salad', 60], ['Raita', 50], ['Russian Salad', 140], ['Fruit Chaat', 160]],
  Starters: [['Chicken Corn Soup', 150], ['Vegetable Samosa', 80], ['Dahi Bhallay', 130], ['Chicken Shashlik', 300]],
  Desserts: [['Kheer', 150], ['Gajar Halwa', 220], ['Gulab Jamun', 120], ['Ice Cream', 160], ['Shahi Tukray', 190]],
  Drinks: [['Soft Drinks', 90], ['Mineral Water', 40], ['Kashmiri Chai', 110], ['Fresh Lime', 90]],
  Breads: [['Naan', 30], ['Roghni Naan', 50], ['Taftan', 60]],
};

const PACKAGES = [
  {
    name: 'Silver',
    description: 'Classic one-dish menu for budget-friendly functions.',
    price: 1800,
    minGuests: 150,
    items: ['Chicken Qorma', 'Chicken Biryani', 'Fresh Salad', 'Raita', 'Naan', 'Kheer', 'Soft Drinks'],
    optional: [['Gulab Jamun', 100], ['Mineral Water', 40]],
  },
  {
    name: 'Gold',
    description: 'Our most popular wedding menu with BBQ.',
    price: 2500,
    minGuests: 200,
    items: ['Chicken Karahi', 'Mutton Qorma', 'Mutton Pulao', 'Seekh Kabab', 'Chicken Tikka', 'Fresh Salad', 'Raita', 'Naan', 'Kheer', 'Soft Drinks', 'Mineral Water'],
    optional: [['Ice Cream', 120], ['Kashmiri Chai', 80]],
  },
  {
    name: 'Platinum',
    description: 'Premium menu with mutton, fish and live dessert counter.',
    price: 3500,
    minGuests: 200,
    items: ['Chicken Corn Soup', 'Mutton Karahi', 'Chicken Handi', 'Kabuli Pulao', 'Malai Boti', 'Mutton Chops', 'Fish Tikka', 'Russian Salad', 'Raita', 'Roghni Naan', 'Gajar Halwa', 'Shahi Tukray', 'Soft Drinks', 'Kashmiri Chai'],
    optional: [['Ice Cream', 120]],
  },
  {
    name: 'Corporate Hi-Tea',
    description: 'Evening hi-tea for corporate events and engagements.',
    price: 1200,
    minGuests: 50,
    items: ['Vegetable Samosa', 'Chicken Shashlik', 'Dahi Bhallay', 'Fruit Chaat', 'Kashmiri Chai', 'Soft Drinks'],
    optional: [['Gulab Jamun', 100]],
  },
];

const CUSTOMERS = [
  ['Muhammad Ahmed Raza', '0300-4125567', 'Lahore', 'House 21, Block C, Model Town'],
  ['Ayesha Siddiqui', '0321-8876543', 'Lahore', '12-B, DHA Phase 5'],
  ['Usman Tariq', '0333-4459081', 'Lahore', '45 Main Boulevard, Johar Town'],
  ['Fatima Zahra Khan', '0345-6612309', 'Lahore', 'Flat 4, Askari 11'],
  ['Hamza Iqbal', '0301-7743215', 'Lahore', '88-C, Faisal Town'],
  ['Sana Malik', '0322-5567812', 'Lahore', 'Street 9, Allama Iqbal Town'],
  ['Bilal Chaudhry', '0300-9981234', 'Gujranwala', 'Satellite Town'],
  ['Mehwish Anwar', '0334-2210987', 'Lahore', '17 Garden Town'],
  ['Kamran Akmal Butt', '0312-4561237', 'Lahore', 'Gulshan-e-Ravi'],
  ['Zainab Hussain', '0323-7789012', 'Lahore', 'Wapda Town, Phase 1'],
  ['Adeel Rehman', '0300-1239876', 'Sheikhupura', 'Civil Lines'],
  ['Hira Nadeem', '0331-9087654', 'Lahore', 'Cantt, Sarwar Road'],
  ['Faisal Mehmood', '0302-3456781', 'Lahore', 'Township, Sector B1'],
  ['Rabia Saleem', '0346-1122334', 'Kasur', 'Railway Road'],
  ['Tariq Jamil Enterprises', '042-35761234', 'Lahore', 'Office 5, MM Alam Road'],
  ['Nida Farooq', '0320-5566778', 'Lahore', 'Bahria Town, Sector C'],
  ['Omer Shahzad', '0335-6677889', 'Lahore', 'Valencia Town'],
  ['Maryam Aslam', '0311-2233445', 'Lahore', 'Samanabad'],
];

// dayOffset relative to today; negative = past. Halls: 0 Crystal, 1 Garden, 2 Emerald.
const BOOKINGS = [
  { c: 0, h: 0, d: -170, type: 'baraat', guests: 450, pkg: 'Gold', decor: 120000, pay: 'full' },
  { c: 0, h: 1, d: -169, type: 'walima', guests: 700, pkg: 'Platinum', decor: 150000, pay: 'full' },
  { c: 1, h: 1, d: -150, type: 'mehndi', guests: 500, pkg: 'Silver', decor: 180000, pay: 'full', start: '20:00', end: '01:00' },
  { c: 2, h: 2, d: -140, type: 'engagement', guests: 150, pkg: 'Corporate Hi-Tea', decor: 40000, pay: 'full', start: '17:00', end: '20:00' },
  { c: 3, h: 0, d: -120, type: 'baraat', guests: 500, pkg: 'Gold', decor: 100000, pay: 'full' },
  { c: 4, h: 1, d: -110, type: 'walima', guests: 850, pkg: 'Gold', decor: 130000, pay: 'balance', balance: 185000 },
  { c: 14, h: 2, d: -100, type: 'corporate', guests: 120, pkg: 'Corporate Hi-Tea', decor: 0, pay: 'full', start: '18:00', end: '21:00', tax: 16 },
  { c: 5, h: 0, d: -85, type: 'wedding', guests: 400, pkg: 'Platinum', decor: 140000, pay: 'full' },
  { c: 6, h: 1, d: -70, type: 'mehndi', guests: 600, pkg: 'Silver', decor: 200000, pay: 'balance', balance: 95000, start: '20:00', end: '00:30' },
  { c: 7, h: 0, d: -60, type: 'cancel', cancelAt: -75, refund: 50000, guests: 300, pkg: 'Silver', decor: 60000, eventType: 'walima' },
  { c: 8, h: 2, d: -45, type: 'birthday', guests: 80, pkg: null, custom: ['Chicken Biryani', 'Chicken Tikka', 'Ice Cream', 'Soft Drinks'], decor: 25000, pay: 'full', start: '19:00', end: '22:00' },
  { c: 9, h: 0, d: -30, type: 'baraat', guests: 550, pkg: 'Gold', decor: 110000, pay: 'full' },
  { c: 9, h: 1, d: -29, type: 'walima', guests: 800, pkg: 'Gold', decor: 120000, pay: 'balance', balance: 240000 },
  { c: 10, h: 0, d: -14, type: 'wedding', guests: 350, pkg: 'Silver', decor: 80000, pay: 'full' },
  { c: 15, h: 2, d: -8, type: 'engagement', guests: 120, pkg: 'Corporate Hi-Tea', decor: 35000, pay: 'balance', balance: 60000, start: '16:00', end: '19:00' },
  { c: 11, h: 1, d: -3, type: 'mehndi', guests: 450, pkg: 'Silver', decor: 160000, pay: 'full', start: '20:00', end: '01:00' },
  { c: 12, h: 0, d: 0, type: 'baraat', guests: 500, pkg: 'Gold', decor: 125000, pay: 'advance', advance: 0.7 },
  { c: 13, h: 2, d: 2, type: 'birthday', guests: 60, pkg: null, custom: ['Chicken Karahi', 'Naan', 'Gulab Jamun', 'Soft Drinks'], decor: 15000, pay: 'advance', advance: 0.5, start: '19:30', end: '22:30' },
  { c: 16, h: 0, d: 5, type: 'wedding', guests: 420, pkg: 'Platinum', decor: 150000, pay: 'advance', advance: 0.6 },
  { c: 16, h: 1, d: 6, type: 'walima', guests: 900, pkg: 'Gold', decor: 140000, pay: 'advance', advance: 0.3 },
  { c: 17, h: 1, d: 12, type: 'mehndi', guests: 500, pkg: 'Silver', decor: 170000, pay: 'advance', advance: 0.35, start: '20:00', end: '00:30' },
  { c: 1, h: 2, d: 18, type: 'engagement', guests: 100, pkg: 'Corporate Hi-Tea', decor: 30000, status: 'tentative', pay: 'none' },
  { c: 3, h: 0, d: 25, type: 'baraat', guests: 480, pkg: 'Gold', decor: 115000, pay: 'advance', advance: 0.25 },
  { c: 14, h: 2, d: 33, type: 'corporate', guests: 150, pkg: 'Corporate Hi-Tea', decor: 20000, pay: 'advance', advance: 0.5, start: '18:00', end: '21:30', tax: 16 },
  { c: 5, h: 1, d: 45, type: 'walima', guests: 750, pkg: 'Platinum', decor: 160000, pay: 'advance', advance: 0.2 },
  { c: 2, h: 0, d: 60, type: 'wedding', guests: 380, pkg: 'Gold', decor: 90000, status: 'tentative', pay: 'none' },
  { c: 7, h: 1, d: 75, type: 'mehndi', guests: 400, pkg: 'Silver', decor: 150000, status: 'inquiry', pay: 'none', start: '20:00', end: '00:00' },
  { c: 10, h: 0, d: 90, type: 'walima', guests: 520, pkg: 'Gold', decor: 100000, status: 'inquiry', pay: 'none' },
];

const STAFF = [
  ['Naveed Akhtar', 'manager', 120000, -900],
  ['Sadia Parveen', 'accountant', 85000, -700],
  ['Asma Riaz', 'receptionist', 45000, -400],
  ['Ustad Nazir Ahmed', 'chef', 110000, -1100],
  ['Rafiq Masih', 'chef', 70000, -500],
  ['Imran Ali', 'waiter', 32000, -300],
  ['Shahid Hussain', 'waiter', 32000, -260],
  ['Waqas Javed', 'waiter', 30000, -120],
  ['Ali Raza', 'waiter', 30000, -90],
  ['Nasreen Bibi', 'cleaner', 28000, -600],
  ['Gul Khan', 'security', 35000, -800],
  ['Sher Muhammad', 'security', 35000, -450],
  ['Javed Iqbal', 'driver', 38000, -350],
];

const INVENTORY = [
  ['Basmati Rice (Super Kernel)', 'food', 'Rice', 'RICE-SK', 'kg', 150, 360, 'Akbari Mandi Traders', 420],
  ['Chicken (whole, fresh)', 'food', 'Chicken', 'CHK-FRS', 'kg', 80, 620, 'Big Bird Poultry', 60],
  ['Mutton (fresh)', 'food', 'Mutton', 'MTN-FRS', 'kg', 40, 2100, 'Lahore Meat House', 55],
  ['Cooking Oil', 'food', 'Oil', 'OIL-CK', 'litre', 60, 580, 'Akbari Mandi Traders', 140],
  ['Desi Ghee', 'food', 'Oil', 'GHEE-DS', 'kg', 20, 2400, 'Akbari Mandi Traders', 18],
  ['Red Chilli Powder', 'food', 'Spices', 'SPC-RCP', 'kg', 10, 1200, 'Akbari Mandi Traders', 22],
  ['Garam Masala', 'food', 'Spices', 'SPC-GM', 'kg', 5, 2600, 'Akbari Mandi Traders', 4],
  ['Onions', 'food', 'Vegetables', 'VEG-ONI', 'kg', 100, 140, 'Sabzi Mandi Supplier', 260],
  ['Tomatoes', 'food', 'Vegetables', 'VEG-TOM', 'kg', 80, 160, 'Sabzi Mandi Supplier', 45],
  ['Yogurt', 'food', 'Dairy', 'DRY-YOG', 'kg', 60, 240, 'Haleeb Dairy Point', 90],
  ['Milk', 'food', 'Dairy', 'DRY-MLK', 'litre', 80, 210, 'Haleeb Dairy Point', 120],
  ['Sugar', 'food', 'Groceries', 'GRC-SUG', 'kg', 50, 150, 'Akbari Mandi Traders', 180],
  ['Soft Drinks (1.5L)', 'food', 'Drinks', 'DRK-SD15', 'bottle', 200, 230, 'Pepsi Distributor Lahore', 480],
  ['Mineral Water (500ml)', 'food', 'Drinks', 'DRK-MW05', 'crate', 30, 900, 'Pepsi Distributor Lahore', 24],
  ['Banquet Chairs', 'equipment', 'Furniture', 'EQP-CHR', 'piece', 900, 2200, 'Royal Tent Service', 1150],
  ['Round Tables (10 seater)', 'equipment', 'Furniture', 'EQP-TBL', 'piece', 90, 9500, 'Royal Tent Service', 110],
  ['Crockery Sets', 'equipment', 'Crockery', 'EQP-CRK', 'set', 900, 650, 'Crockery Bazaar', 980],
  ['Glassware', 'equipment', 'Crockery', 'EQP-GLS', 'piece', 1000, 120, 'Crockery Bazaar', 1350],
  ['Chafing Dishes', 'equipment', 'Kitchen', 'EQP-CHF', 'piece', 40, 8500, 'Crockery Bazaar', 36],
  ['Sound System (line array)', 'equipment', 'Sound', 'EQP-SND', 'set', 2, 450000, 'DJ Sound Rental', 3],
  ['LED Par Lights', 'equipment', 'Lighting', 'EQP-LED', 'piece', 40, 6500, 'DJ Sound Rental', 64],
  ['Stage Decoration Set', 'equipment', 'Decoration', 'EQP-STG', 'set', 3, 180000, 'Royal Tent Service', 4],
];

const SUPPLIERS = [
  ['Akbari Mandi Traders', 'Haji Aslam', '0300-4411223'],
  ['Big Bird Poultry', 'Nadeem Shah', '0321-6677001'],
  ['Lahore Meat House', 'Chaudhry Rashid', '0333-1122990'],
  ['Sabzi Mandi Supplier', 'Allah Ditta', '0345-9988776'],
  ['Haleeb Dairy Point', 'Zubair Ahmed', '0302-5544331'],
  ['Pepsi Distributor Lahore', 'Sales Desk', '042-35123456'],
  ['Royal Tent Service', 'Saleem Butt', '0300-7788990'],
  ['Crockery Bazaar', 'Arif Hussain', '0322-1239870'],
  ['DJ Sound Rental', 'DJ Faraz', '0331-4567123'],
];

// ─── Seeding ─────────────────────────────────────────────────

async function main() {
  if (env.isProduction && !process.argv.includes('--force')) {
    console.error('Refusing to seed a production database. Pass --force if you really mean it.');
    process.exit(1);
  }
  await connectDatabase(env.MONGODB_URI);
  console.log(`[seed] resetting ${mongoose.connection.name}`);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((model) => model.createIndexes()));

  const { organization, roles, owner } = await createOrganization({
    name: 'Shahi Mahal Banquets',
    owner: { name: 'Umair Khan', email: ADMIN_EMAIL, password: ADMIN_PASSWORD, phone: '0300-1112233' },
    business: {
      tagline: 'Weddings · Banquets · Marquees',
      address: '14-A Main Boulevard, Gulberg III',
      city: 'Lahore',
      phone: '+92 42 3577 1234',
      email: 'bookings@shahimahal.pk',
      website: 'www.shahimahal.pk',
      tax: { ntn: '4198765-3', strn: '32-77-8765-432-19', label: 'PST', defaultRate: 0 },
      invoice: {
        terms: [
          '1. 50% advance confirms the booking; the balance is due before the event.',
          '2. Advance is non-refundable within 30 days of the event date.',
          '3. Guest count may be revised up to 7 days before the event; per-head charges apply to the final count.',
          '4. Music and fireworks must end by 10:00 pm as per government regulations.',
          '5. Damage to hall property will be charged at actual cost.',
        ].join('\n'),
      },
    },
  });
  const organizationId = organization._id;
  invalidateSettings(organizationId);

  const roleByKey = Object.fromEntries(roles.map((role) => [role.key, role]));
  const ownerWithRole = { ...owner.toObject(), role: roleByKey.super_admin };
  const ctx = buildContext(ownerWithRole, null, { ip: '127.0.0.1' });

  // Team accounts, one per role.
  const team = [
    ['Bilal Ahmed', 'manager@shadihall.pk', 'manager'],
    ['Sadia Parveen', 'accounts@shadihall.pk', 'accountant'],
    ['Asma Riaz', 'frontdesk@shadihall.pk', 'receptionist'],
    ['Imran Ali', 'staff@shadihall.pk', 'staff'],
  ];
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  await models.User.insertMany(team.map(([name, email, role]) => ({ organizationId, name, email, role: roleByKey[role]._id, passwordHash, createdBy: owner._id })));

  // Halls
  const halls = [];
  for (const hall of HALLS) halls.push(await hallsService.create(ctx, hall));
  console.log(`[seed] ${halls.length} halls`);

  // Menu
  const itemsByName = {};
  let sortOrder = 0;
  for (const [categoryName, dishes] of Object.entries(MENU)) {
    const category = await menuService.createCategory(ctx, { name: categoryName, sortOrder: (sortOrder += 10), isActive: true });
    for (const [name, price] of dishes) {
      const unit = categoryName === 'Breads' ? 'per_piece' : 'per_person';
      itemsByName[name] = await menuService.createItem(ctx, { name, category: category._id, price, unit, isAvailable: true, ingredients: [] });
    }
  }
  const packagesByName = {};
  for (const pkg of PACKAGES) {
    packagesByName[pkg.name] = await menuService.createPackage(ctx, {
      name: pkg.name,
      description: pkg.description,
      pricingType: 'per_person',
      price: pkg.price,
      minGuests: pkg.minGuests,
      isActive: true,
      items: [
        ...pkg.items.map((name) => ({ menuItem: itemsByName[name]._id, isOptional: false, extraPrice: 0 })),
        ...pkg.optional.map(([name, extraPrice]) => ({ menuItem: itemsByName[name]._id, isOptional: true, extraPrice })),
      ],
    });
  }
  console.log(`[seed] ${Object.keys(itemsByName).length} dishes, ${PACKAGES.length} packages`);

  // Customers
  const customers = [];
  for (const [index, [fullName, phone, city, address]] of CUSTOMERS.entries()) {
    const customer = await customersService.create(ctx, { fullName, phone, city, address, email: index % 3 === 0 ? `${fullName.split(' ')[0].toLowerCase()}@gmail.com` : '' });
    customers.push(customer);
  }
  console.log(`[seed] ${customers.length} customers`);

  // Suppliers & inventory
  const suppliers = {};
  for (const [name, contactPerson, phone] of SUPPLIERS) {
    suppliers[name] = await inventoryService.createSupplier(ctx, { name, contactPerson, phone, isActive: true });
  }
  const inventoryItems = [];
  for (const [name, kind, category, sku, unit, minimumQuantity, costPerUnit, supplierName, opening] of INVENTORY) {
    const item = await inventoryService.createItem(ctx, {
      name,
      kind,
      category,
      sku,
      unit,
      minimumQuantity,
      costPerUnit,
      supplier: suppliers[supplierName]._id,
      location: kind === 'food' ? 'Main store room' : 'Equipment godown',
      openingQuantity: opening,
    });
    inventoryItems.push(item);
  }
  const glassware = inventoryItems.find((item) => item.sku === 'EQP-GLS');
  await inventoryService.recordTransaction(ctx, { item: glassware._id, type: 'damaged', quantity: 420, date: day(-20), notes: 'Broken during walima clean-up', recordExpense: false });
  const garamMasala = inventoryItems.find((item) => item.sku === 'SPC-GM');
  await inventoryService.recordTransaction(ctx, { item: garamMasala._id, type: 'stock_out', quantity: 4, date: day(-5), notes: 'Kitchen use', recordExpense: false });
  const foodItems = inventoryItems.filter((item) => item.kind === 'food');
  console.log(`[seed] ${inventoryItems.length} inventory items, ${Object.keys(suppliers).length} suppliers`);

  // Expenses: monthly overheads for 6 months (event costs are added with each booking below).
  const categories = Object.fromEntries((await expensesService.listCategories(ctx)).map((category) => [category.key, category._id]));
  const addExpense = (key, amount, date, description, extra = {}) =>
    date <= today && amount >= 100 ? expensesService.create(ctx, { category: categories[key], amount: roundTo(amount, 100), date, description, paymentMethod: extra.paymentMethod ?? 'bank_transfer', source: 'manual', ...extra }) : null;
  for (let month = 5; month >= 0; month -= 1) {
    const monthStart = toDateOnly(formatDateOnly(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - month, 1))));
    await addExpense('electricity', 180000 + random() * 90000, addDays(monthStart, 9), 'LESCO electricity bill', { vendor: 'LESCO' });
    await addExpense('gas', 35000 + random() * 20000, addDays(monthStart, 11), 'SNGPL gas bill', { vendor: 'SNGPL' });
    await addExpense('water', 6000 + random() * 3000, addDays(monthStart, 12), 'WASA water bill', { vendor: 'WASA' });
    await addExpense('marketing', 40000 + random() * 30000, addDays(monthStart, 3), 'Facebook & Instagram ads', { vendor: 'Meta Ads', paymentMethod: 'card' });
    await addExpense('cleaning', 15000 + random() * 8000, addDays(monthStart, 20), 'Cleaning supplies & deep cleaning', { vendor: 'CleanPro Services', paymentMethod: 'cash' });
    if (month % 2 === 0) await addExpense('maintenance', 25000 + random() * 60000, addDays(monthStart, 16), pick(['Generator servicing', 'AC maintenance', 'Plumbing repairs', 'Stage lights repair']), { vendor: 'Hassan Electric Works', paymentMethod: 'cash' });
  }
  // Staff, attendance, salaries
  const staff = [];
  for (const [index, [name, position, salary, joined]] of STAFF.entries()) {
    staff.push(
      await staffService.create(ctx, {
        name,
        position,
        salary,
        joiningDate: day(joined),
        status: index === 8 ? 'on_leave' : 'active',
        phone: `03${String(index).padStart(2, '0')}-${String(4000000 + index * 7919).slice(0, 7)}`,
        cnic: `35202-${String(1000000 + index * 123457).slice(0, 7)}-${index % 10}`,
        address: 'Lahore',
      }),
    );
  }
  for (let offset = -29; offset <= 0; offset += 1) {
    const date = day(offset);
    if (date.getUTCDay() === 1 && offset !== 0) continue; // Monday off
    await staffService.saveAttendance(ctx, {
      date,
      entries: staff
        .filter((member) => member.status === 'active' && member.joiningDate <= date)
        .map((member) => {
          const roll = random();
          const status = roll > 0.93 ? 'absent' : roll > 0.86 ? 'late' : roll > 0.82 ? 'leave' : roll > 0.79 ? 'half_day' : 'present';
          return { staff: member._id, status, checkIn: status === 'late' ? '11:20' : status === 'present' || status === 'half_day' ? '10:00' : '', checkOut: status === 'present' || status === 'late' ? '22:00' : '' };
        }),
    });
  }
  for (let month = 3; month >= 1; month -= 1) {
    const periodStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - month, 1));
    const period = formatDateOnly(periodStart).slice(0, 7);
    const paidOn = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - month + 1, 3));
    for (const member of staff.filter((entry) => entry.joiningDate <= periodStart)) {
      await staffService.paySalary(ctx, { staff: member._id, period, grossAmount: member.salary, bonus: month === 1 && member.position === 'chef' ? 10000 : 0, deductions: 0, paidOn, method: member.salary > 60000 ? 'bank_transfer' : 'cash' });
    }
  }
  // Mid-month advances in the current month.
  const currentPeriod = formatDateOnly(today).slice(0, 7);
  for (const member of staff.filter((entry) => ['waiter', 'cleaner'].includes(entry.position)).slice(0, 3)) {
    await staffService.paySalary(ctx, { staff: member._id, period: currentPeriod, grossAmount: 10000, bonus: 0, deductions: 0, paidOn: day(-10), method: 'cash', notes: 'Salary advance' });
  }
  console.log(`[seed] ${staff.length} employees with attendance and salaries`);

  // Bookings, payments and invoices
  const createdBookings = [];
  for (const spec of BOOKINGS) {
    const eventDate = day(spec.d);
    const bookedOn = minDate(addDays(eventDate, -(40 + Math.floor(random() * 60))), today);
    const isPast = spec.d <= 0;
    const eventType = spec.type === 'cancel' ? spec.eventType : spec.type;
    const status = spec.type === 'cancel' ? 'confirmed' : spec.status ?? (spec.d < 0 ? 'completed' : 'confirmed');
    const menu = spec.pkg
      ? { mode: 'package', package: packagesByName[spec.pkg]._id, extras: random() > 0.6 ? [{ menuItem: itemsByName['Ice Cream']._id, unitPrice: 120 }] : [] }
      : { mode: 'custom', items: spec.custom.map((name) => ({ menuItem: itemsByName[name]._id })) };

    const { booking } = await bookingsService.create(ctx, {
      customer: customers[spec.c]._id,
      hall: halls[spec.h]._id,
      eventType,
      eventDate,
      startTime: spec.start ?? '19:00',
      endTime: spec.end ?? '23:30',
      guestCount: spec.guests,
      menu,
      services: spec.decor > 100000 ? [{ name: 'Photography & videography', quantity: 1, unitPrice: 85000 }, { name: 'Fireworks', quantity: 1, unitPrice: 25000 }] : spec.decor ? [{ name: 'Photography', quantity: 1, unitPrice: 45000 }] : [],
      charges: { hall: halls[spec.h].basePrice, decoration: spec.decor, other: 0, discount: roundTo(random() * 40000, 5000), taxRate: spec.tax ?? 0 },
      status: isPast && status === 'completed' ? 'completed' : status,
      notes: random() > 0.7 ? pick(['Family prefers less spicy food.', 'Separate seating arrangement required.', 'Bride entry with dhol at 9 pm.', 'VIP parking for 10 cars.']) : undefined,
    });
    await backdate(models.Booking, booking._id, bookedOn);
    const total = booking.totals.grandTotal;

    // Advances and installments are round figures; a final payment settles the exact balance.
    const receive = (amount, paidOn, type, exact = false) =>
      amount > 0 && paidOn <= today
        ? paymentsService.receive(ctx, { booking: booking._id, amount: exact ? amount : roundTo(amount, 1000), method: pick(['cash', 'cash', 'bank_transfer', 'jazzcash', 'easypaisa', 'cheque']), paidOn, type, reference: random() > 0.5 ? `TXN${Math.floor(random() * 900000 + 100000)}` : undefined })
        : null;

    if (spec.type === 'cancel') {
      await receive(total * 0.3, bookedOn, 'advance');
      await bookingsService.changeStatus(ctx, booking._id, { status: 'cancelled', reason: 'Family postponed the wedding' });
      await paymentsService.refund(ctx, { booking: booking._id, amount: spec.refund, method: 'bank_transfer', paidOn: day(spec.cancelAt), notes: 'Partial refund of advance as per policy' });
    } else if (spec.pay === 'full' || spec.pay === 'balance') {
      const outstanding = spec.pay === 'balance' ? spec.balance : 0;
      const advance = roundTo(total * 0.4, 1000);
      await receive(advance, bookedOn, 'advance');
      const middle = roundTo((total - advance - outstanding) * 0.5, 1000);
      await receive(middle, minDate(addDays(eventDate, -10), today), 'installment');
      const current = await models.Booking.findById(booking._id).lean();
      await receive(current.totals.balance - outstanding, minDate(addDays(eventDate, 1), today), undefined, outstanding === 0);
    } else if (spec.pay === 'advance') {
      await receive(total * spec.advance, bookedOn, 'advance');
    }

    // Costs of past events: decoration, extra waiters, transport, and food bought and used for the event.
    if (spec.d <= 0 && spec.type !== 'cancel') {
      await addExpense('decoration', spec.decor * (0.45 + random() * 0.15), addDays(eventDate, -1), `Flowers & stage decor for ${booking.bookingNumber}`, { booking: booking._id, vendor: 'Gulshan Florist', paymentMethod: 'cash' });
      await addExpense('staff', spec.guests * 40, eventDate, `Extra waiters (daily wages) for ${booking.bookingNumber}`, { booking: booking._id, paymentMethod: 'cash' });
      await addExpense('food', booking.totals.menu * (0.42 + random() * 0.12), addDays(eventDate, -1), `Meat, vegetables & groceries for ${booking.bookingNumber}`, { booking: booking._id, vendor: 'Akbari Mandi Traders', paymentMethod: 'cash' });
      if (spec.guests > 400) await addExpense('transportation', 12000 + random() * 6000, addDays(eventDate, -1), `Loader rickshaw & van for ${booking.bookingNumber}`, { booking: booking._id, paymentMethod: 'cash' });
      if (spec.d > -60) {
        for (const item of foodItems.slice(0, 4)) {
          const needed = Math.max(5, Math.round((spec.guests / 100) * (item.unit === 'kg' ? 12 : 6)));
          await inventoryService.recordTransaction(ctx, {
            item: item._id,
            type: 'purchase',
            quantity: needed,
            unitCost: roundTo(item.costPerUnit * (0.95 + random() * 0.1), 5),
            date: addDays(eventDate, -2),
            booking: booking._id,
            recordExpense: true,
            paymentMethod: 'cash',
          });
          await inventoryService.recordTransaction(ctx, { item: item._id, type: 'stock_out', quantity: needed, date: eventDate, booking: booking._id, notes: `Used for ${booking.bookingNumber}`, recordExpense: false });
        }
      }
    }

    createdBookings.push({ spec, booking });
    if (spec.type !== 'cancel' && (status === 'confirmed' || status === 'completed')) {
      if (random() > 0.35) await invoicesService.create(ctx, { booking: booking._id });
    }
  }
  console.log(`[seed] ${createdBookings.length} bookings`);
  console.log(`[seed] ${await models.Expense.countDocuments({ organizationId })} expenses`);

  // Backdate customers to their first booking so "new customers" reports look real.
  for (const customer of customers) {
    const first = await models.Booking.findOne({ customer: customer._id }).sort({ createdAt: 1 }).select('createdAt').lean();
    if (first) await models.Customer.collection.updateOne({ _id: customer._id }, { $set: { createdAt: first.createdAt } });
  }

  console.log('\n[seed] done. Sign in with:');
  console.log(`  Super Admin   ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  for (const [, email, role] of team) console.log(`  ${role.padEnd(13)} ${email} / ${DEMO_PASSWORD}`);
  await disconnectDatabase();
}

main().catch(async (error) => {
  console.error('[seed] failed:', error);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
