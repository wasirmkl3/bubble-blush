'use strict';
/*
 * Bubble Blush menu (finalized). Prices are the shop's real prices.
 * Recipes (grams/ml per cup) and ingredient costs are ESTIMATES used for stock and
 * profit tracking: correct them in Menu & Pricing and Inventory.
 */
const Seed = (() => {
  const SETTINGS = {
    id: 'main',
    shopName: 'Bubble Blush',
    tagline: 'Good Drinks, Brighter Days',
    address: 'Khulna, Bangladesh',
    phone: '01XXXXXXXXX',
    social: 'facebook.com/bubbleblush',
    bin: '',
    receiptFooter: 'Thank you for choosing Bubble Blush!',
    paperWidth: 58,
    printMode: 'direct',      // 'direct' = print helper (exact length, no dialog) · 'browser' = print window
    receiptPrinter: '',       // Windows printer name for bills (auto-detected)
    imageMode: 'raster',      // 'raster' (GS v 0) or 'compat' (ESC *) for older printers
    marginTopMm: 5,           // blank paper above the first line (mm)
    marginBottomMm: 16,       // blank paper after the last line, so tearing never cuts text (mm)
    receiptCut: false,        // send a cut command (only for printers with an auto-cutter)
    openDrawer: false,        // kick a cash drawer connected to the bill printer
    schema: 5,
    receiptLogo: true,
    receiptFontPx: 12,
    stickersEnabled: true,
    stickerW: 50,
    stickerH: 30,
    stickerShowShop: true,
    printReceiptDefault: true,
    printStickerDefault: false, // stickers use the Edge print window: tick only when a label printer is set up
    printKitchenDefault: true,  // second copy for the staff making the drinks
    kitchenMode: 'manual',      // 'manual' = wait until the bill is torn off · 'auto' = print right after (auto-cutter)
    vatPct: 0,
    vatMode: 'exclusive',
    dayStartHour: 4,
    orderTypes: ['Takeaway', 'Dine-in', 'Delivery'],
    payMethods: ['Cash', 'bKash', 'Nagad', 'Card'],
    sugarLevels: ['0%', '25%', '50%', '75%', '100%'],
    sugarLabels: { '0%': 'No Sugar', '25%': 'Less Sweet', '50%': 'Half Sugar', '75%': 'Sweet', '100%': 'Full Sugar' },
    iceLevels: ['No Ice', 'Less Ice', 'Regular Ice'],
    defaultSugar: '100%',
    defaultIce: 'Regular Ice',
    // Promotion: one free topping per drink (the most expensive added topping), between these business days.
    promo: { enabled: false, name: 'Opening Day Free Topping', from: '', to: '' },
    discountPresets: [5, 10, 15, 20],
    loyaltyEvery: 10,
    targetFoodCost: 30,
    pin: '',
    logoData: '',
    lastBackupAt: null,
    sizes: [
      { id: 'M', name: 'Medium', short: 'M', volume: '', packaging: [['cup500', 1], ['film', 1], ['straw', 1], ['label', 1]] },
      { id: 'L', name: 'Large', short: 'L', volume: '', packaging: [['cup700', 1], ['film', 1], ['straw', 1], ['label', 1]] },
    ],
  };

  // id, name, unit, costPerUnit (৳ per unit, estimate), stock, lowAt, packSize, packLabel
  const INGREDIENTS = [
    ['greentea', 'Jasmine green tea', 'g', 1.2, 1000, 300, 500, '500 g pack'],
    ['blacktea', 'Black tea leaves', 'g', 0.8, 1000, 300, 500, '500 g pack'],
    ['milk', 'Whole milk', 'ml', 0.11, 10000, 3000, 1000, '1 L pack'],
    ['creamer', 'Non-dairy creamer', 'g', 0.35, 5000, 1500, 1000, '1 kg pack'],
    ['coconutmilk', 'Coconut milk', 'ml', 0.375, 2000, 800, 400, '400 ml can'],
    ['syrup', 'Sugar syrup', 'ml', 0.12, 5000, 1500, 1000, '1 L (homemade)'],
    ['brownsyrup', 'Brown sugar syrup', 'ml', 0.35, 3000, 1000, 1000, '1 L bottle'],
    ['taro', 'Taro powder', 'g', 1.1, 2000, 500, 1000, '1 kg pack'],
    ['peach', 'Peach syrup', 'ml', 0.6, 2000, 700, 750, '750 ml bottle'],
    ['mango', 'Mango puree', 'ml', 0.45, 3000, 1000, 1000, '1 L pack'],
    ['passion', 'Passion fruit syrup', 'ml', 0.7, 2000, 700, 750, '750 ml bottle'],
    ['strawberry', 'Strawberry syrup', 'ml', 0.6, 2000, 700, 750, '750 ml bottle'],
    ['lychee', 'Lychee syrup', 'ml', 0.6, 2000, 700, 750, '750 ml bottle'],
    ['berry', 'Mixed berry syrup', 'ml', 0.7, 2000, 700, 750, '750 ml bottle'],
    ['lime', 'Lime', 'pcs', 4, 40, 15, 1, 'piece'],
    ['pearls', 'Black tapioca pearls (dry)', 'g', 0.45, 3000, 1000, 1000, '1 kg pack'],
    ['goldpearls', 'Golden tapioca pearls (dry)', 'g', 0.7, 2000, 700, 1000, '1 kg pack'],
    ['cocojelly', 'Coconut jelly', 'g', 0.5, 3000, 1000, 1000, '1 kg jar'],
    ['pop-strawberry', 'Popping balls · Strawberry', 'g', 0.9, 1000, 300, 1000, '1 kg jar'],
    ['pop-mango', 'Popping balls · Mango', 'g', 0.9, 1000, 300, 1000, '1 kg jar'],
    ['pop-passion', 'Popping balls · Passion Fruit', 'g', 0.9, 1000, 300, 1000, '1 kg jar'],
    ['pop-lychee', 'Popping balls · Lychee', 'g', 0.9, 1000, 300, 1000, '1 kg jar'],
    ['crys-strawberry', 'Crystal balls · Strawberry', 'g', 0.8, 1000, 300, 1000, '1 kg jar'],
    ['crys-pomelo', 'Crystal balls · Pomelo', 'g', 0.8, 1000, 300, 1000, '1 kg jar'],
    ['crys-cream', 'Crystal balls · Cold Cream', 'g', 0.8, 1000, 300, 1000, '1 kg jar'],
    ['cup500', 'Cold cup Medium', 'pcs', 6, 500, 150, 50, '50-pc sleeve'],
    ['cup700', 'Cold cup Large', 'pcs', 8, 500, 150, 50, '50-pc sleeve'],
    ['film', 'Sealing film', 'pcs', 1, 2000, 500, 2000, '1 roll'],
    ['straw', 'Boba straw', 'pcs', 1.5, 1000, 300, 100, '100-pc pack'],
    ['label', 'Cup sticker label', 'pcs', 0.5, 1000, 300, 500, '500-pc roll'],
  ];

  const CATEGORIES = [
    ['fruit', 'Fruit Teas', '#F2B8A2'],
    ['premiumfruit', 'Premium Fruit Teas', '#C9A24A'],
    ['milktea', 'Milk Teas', '#A8C3C9'],
    ['premiummilk', 'Premium Milk Teas', '#B9A7D6'],
  ];

  // [id, catId, name, description, badge, included topping ids, {M: price, L: price},
  //  recipe for Medium (Large = ×LARGE_MULT), optional explicit Large recipe]
  const ITEMS = [
    ['peach-jasmine', 'fruit', 'Peach Jasmine Tea', '', '', [], { M: 170, L: 210 },
      { greentea: 4, peach: 40, syrup: 15 }],
    ['mango-jasmine', 'fruit', 'Mango Jasmine Tea', '', '', [], { M: 170, L: 210 },
      { greentea: 4, mango: 60, syrup: 15 }],
    ['passion-jasmine', 'fruit', 'Passion Fruit Jasmine Tea', '', '', [], { M: 170, L: 210 },
      { greentea: 4, passion: 40, syrup: 10 }],
    ['strawberry-lime', 'fruit', 'Strawberry & Lime Jasmine Tea', '', '', [], { M: 170, L: 210 },
      { greentea: 4, strawberry: 40, lime: 0.5, syrup: 10 }],
    ['lychee-paradise', 'premiumfruit', 'Lychee Paradise', 'A sunshine-inspired blend of peach and lychee.', '', ['t-cocojelly'], { M: 220, L: 260 },
      { greentea: 4, peach: 25, lychee: 25, cocojelly: 40 }],
    ['passion-paradise', 'premiumfruit', 'Passion in Paradise', 'A tropical blend of sweet mango and tangy passion fruit.', '', ['t-cocojelly'], { M: 220, L: 260 },
      { greentea: 4, mango: 40, passion: 25, cocojelly: 40 }],
    ['brown-sugar', 'milktea', 'Brown Sugar Milk Tea', '', 'Our Signature', ['t-black'], { M: 190, L: 230 },
      { blacktea: 5, milk: 120, creamer: 20, brownsyrup: 35, pearls: 30 }],
    ['mango-blush', 'milktea', 'Mango Blush', 'A tropical harmony of juicy mango and velvety coconut.', '', [], { M: 190, L: 230 },
      { blacktea: 4, mango: 50, coconutmilk: 60, milk: 60, syrup: 10 }],
    ['strawberry-bliss', 'milktea', 'Strawberry Bliss', '', '', [], { M: 190, L: 230 },
      { blacktea: 4, strawberry: 35, milk: 100, creamer: 15 }],
    ['very-berry', 'premiummilk', 'The Very Berry', 'A vibrant blend of mixed berries with creamy whole milk.', '', [], { M: 230, L: 270 },
      { blacktea: 3, berry: 40, milk: 150, syrup: 10 }],
    ['premium-brown-sugar', 'premiummilk', 'Premium Brown Sugar', '', 'Our Favourite', [], { L: 300 },
      {}, { milk: 250, brownsyrup: 50, pearls: 50 }],
    ['taro-coconut', 'premiummilk', 'Taro Coconut Milk Tea', '', '', [], { M: 230, L: 270 },
      { blacktea: 3, taro: 25, coconutmilk: 60, milk: 80, syrup: 10 }],
  ];

  // id, name, price, recipe, flavours [[id, name, ingredient id]] (flavour uses `qty` of its own ingredient)
  const TOPPINGS = [
    ['t-black', 'Black Tapioca Pearls', 20, { pearls: 25 }],
    ['t-golden', 'Golden Tapioca Pearls', 30, { goldpearls: 25 }],
    ['t-cocojelly', 'Coconut Jelly', 30, { cocojelly: 30 }],
    ['t-popping', 'Popping Balls', 50, {}, 30, [
      ['strawberry', 'Strawberry', 'pop-strawberry'], ['mango', 'Mango', 'pop-mango'],
      ['passion', 'Passion Fruit', 'pop-passion'], ['lychee', 'Lychee', 'pop-lychee']]],
    ['t-crystal', 'Crystal Balls', 40, {}, 30, [
      ['strawberry', 'Strawberry', 'crys-strawberry'], ['pomelo', 'Pomelo', 'crys-pomelo'], ['coldcream', 'Cold Cream', 'crys-cream']]],
  ];

  // Large cup is 700 ml vs 500 ml, but ice takes space: ~1.3× the ingredients.
  const LARGE_MULT = 1.3;
  const toRecipe = (obj, mult = 1) => Object.entries(obj).map(([ingId, q]) => ({
    ingId, qty: Math.round(q * mult * 10) / 10,
  }));

  /* `today` = business day the menu is installed (the promotion defaults to that day only). */
  function build(today = '') {
    const now = new Date().toISOString();
    const ingredients = INGREDIENTS.map(([id, name, unit, cost, stock, lowAt, packSize, packLabel]) => ({
      id, name, unit, costPerUnit: cost, stock, lowAt, packSize, packLabel, active: true, createdAt: now,
    }));
    const categories = CATEGORIES.map(([id, name, color], i) => ({ id, name, color, sort: i }));
    const items = ITEMS.map(([id, catId, name, desc, badge, included, prices, recipe, largeRecipe], i) => ({
      id, catId, name, desc, badge, included,
      sort: i,
      active: true,
      allowSugar: true,
      allowIce: true,
      allowToppings: true,
      sizes: Object.entries(prices).map(([sizeId, price]) => ({
        sizeId, price,
        recipe: sizeId === 'L' && largeRecipe ? toRecipe(largeRecipe) : toRecipe(recipe, sizeId === 'L' ? LARGE_MULT : 1),
      })),
    }));
    const toppings = TOPPINGS.map(([id, name, price, recipe, qty, flavours], i) => ({
      id, name, price, recipe: toRecipe(recipe), active: true, sort: i,
      flavours: (flavours || []).map(([fid, fname, ingId]) => ({ id: fid, name: fname, active: true, recipe: [{ ingId, qty }] })),
    }));
    const settings = JSON.parse(JSON.stringify(SETTINGS));
    settings.sizes = settings.sizes.map((s) => ({ ...s, packaging: s.packaging.map(([ingId, qty]) => ({ ingId, qty })) }));
    settings.createdAt = now;
    settings.promo = { ...settings.promo, from: today, to: today };
    return { settings, ingredients, categories, items, toppings };
  }

  return { build, SETTINGS, LARGE_MULT };
})();
