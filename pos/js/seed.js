'use strict';
/*
 * Bubble Blush menu (updated November 2026). Prices are the shop's real prices.
 * Recipes (grams/ml per cup) and ingredient costs are ESTIMATES used for stock and
 * profit tracking: correct them in Menu & Pricing and Inventory.
 */
const Seed = (() => {
  const SETTINGS = {
    id: 'main',
    shopName: 'Bubble Blush',
    tagline: 'Good Drinks, Brighter Days',
    address: "Shop No-12, Blessing Corner (Behind SAFE 'n' SAVE), New Market, Khulna",
    phone: '01XXXXXXXXX',
    social: 'facebook.com/bubbleblushkhulna',
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
    schema: 6,
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
    // Complimentary toppings: staff can give a topping free (relative, favourite customer…).
    compReasons: ['Relative', 'Favourite customer', 'Friend', 'Staff', "Owner's guest"],
    // One-tap side notes for a drink (Sell screen). Edit in Settings → Selling.
    quickNotes: ['Serve first', 'Extra cold', 'No straw', 'Extra straw', 'Separate bag', 'Birthday treat'],
    loyaltyEvery: 10, // old cup-count rule, no longer used
    // Loyalty card: one stamp per day the customer buys (by phone). Complimentary-only orders don't count.
    loyaltyCard: 10,       // visits per card (0 = off); the last visit gets a free drink or dessert
    loyaltyToppingAt: 5,   // this visit gets one free topping (0 = none)
    loyaltyDrinkMax: 200,  // free drink/dessert is worth up to this much; the customer pays any extra
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
    ['evapmilk', 'Evaporated milk', 'ml', 0.5, 2000, 800, 410, '410 ml can'],
    ['cream', 'Whipping cream', 'ml', 0.6, 2000, 700, 1000, '1 L pack'],
    ['creamer', 'Non-dairy creamer', 'g', 0.35, 5000, 1500, 1000, '1 kg pack'],
    ['coconutmilk', 'Coconut milk', 'ml', 0.375, 2000, 800, 400, '400 ml can'],
    ['syrup', 'Sugar syrup', 'ml', 0.12, 5000, 1500, 1000, '1 L (homemade)'],
    ['brownsyrup', 'Brown sugar syrup', 'ml', 0.35, 3000, 1000, 1000, '1 L bottle'],
    ['vanilla', 'Vanilla syrup', 'ml', 0.9, 750, 250, 750, '750 ml bottle'],
    ['taro', 'Taro powder', 'g', 1.1, 2000, 500, 1000, '1 kg pack'],
    ['peach', 'Peach syrup', 'ml', 0.6, 2000, 700, 750, '750 ml bottle'],
    ['mango', 'Mango puree', 'ml', 0.45, 3000, 1000, 1000, '1 L pack'],
    ['passion', 'Passion fruit syrup', 'ml', 0.7, 2000, 700, 750, '750 ml bottle'],
    ['strawberry', 'Strawberry syrup', 'ml', 0.6, 2000, 700, 750, '750 ml bottle'],
    ['lime', 'Lime', 'pcs', 4, 40, 15, 1, 'piece'],
    ['lycheejam', 'Lychee jam', 'g', 0.8, 1000, 300, 1000, '1 kg jar'],
    ['passionjam', 'Passion fruit jam', 'g', 0.8, 1000, 300, 1000, '1 kg jar'],
    ['mangojam', 'Mango jam', 'g', 0.7, 1000, 300, 1000, '1 kg jar'],
    ['strawberryjam', 'Strawberry jam (with fruit chunks)', 'g', 0.7, 1000, 300, 1000, '1 kg jar'],
    ['mulberryjam', 'Mulberry jam', 'g', 0.9, 1000, 300, 1000, '1 kg jar'],
    ['blueberryjam', 'Blueberry jam / compote', 'g', 1.0, 1000, 300, 1000, '1 kg jar'],
    ['chocpowder', 'Chocolate powder', 'g', 1.0, 1000, 300, 1000, '1 kg pack'],
    ['chocsauce', 'Chocolate sauce', 'ml', 0.8, 1000, 300, 1000, '1 L bottle'],
    ['chocchips', 'Chocolate chips', 'g', 1.5, 500, 150, 500, '500 g pack'],
    ['whitechoc', 'White chocolate sauce', 'ml', 1.4, 1000, 300, 1000, '1 L bottle'],
    ['whitechocchips', 'White chocolate chips', 'g', 1.8, 500, 150, 500, '500 g pack'],
    ['biscoff', 'Biscoff spread', 'g', 2.2, 800, 250, 400, '400 g jar'],
    ['cookiecrumb', 'Biscoff cookie crumble', 'g', 1.6, 500, 150, 250, '250 g pack'],
    ['pearls', 'Black tapioca pearls (dry)', 'g', 0.45, 3000, 1000, 1000, '1 kg pack'],
    ['goldpearls', 'Golden tapioca pearls (dry)', 'g', 0.7, 2000, 700, 1000, '1 kg pack'],
    ['cocojelly', 'Coconut jelly', 'g', 0.5, 3000, 1000, 1000, '1 kg jar'],
    ['coffeejelly', 'Coffee jelly', 'g', 0.5, 2000, 700, 1000, '1 kg jar'],
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

  // id, name, colour, description (printed on the menu card)
  const CATEGORIES = [
    ['fruit', 'Fruit Tea Series', '#F2B8A2', 'Refreshing jasmine tea blends with vibrant fruity notes.'],
    ['premiumfruit', 'Premium Fruit Tea Series', '#C9A24A', 'Exquisite tropical blends with luscious fruit jams and delicate jasmine tea.'],
    ['milktea', 'Milk Series', '#A8C3C9', 'Smooth, creamy blends crafted for everyday indulgence.'],
    ['premiummilk', 'Premium Milk Series', '#B9A7D6', 'Luxuriously creamy creations featuring carefully selected ingredients and indulgent textures.'],
    ['chocolate', 'Chocolate & Indulgence Series', '#A9806A', 'Decadent, dessert-inspired creations for your sweetest cravings.'],
    ['special', 'Bubble Blush Special Series', '#E59BB0', 'Exclusive creations crafted for an extraordinary indulgence.'],
  ];

  // Labels: "Signature" shows ★, "Our Favourite" and "People's Choice" show ♥.
  const SIG = 'Signature';
  const FAV = 'Our Favourite';
  const PEOPLE = "People's Choice";

  // [id, catId, name, description, badge, included topping ids, {M: price, L: price},
  //  recipe for Medium (Large = ×LARGE_MULT), optional explicit Large recipe]
  const ITEMS = [
    ['peach-jasmine', 'fruit', 'Peach Jasmine Tea', 'Delicate jasmine tea infused with sweet, juicy peach flavour.', '', [], { M: 170, L: 210 },
      { greentea: 4, peach: 40, syrup: 15 }],
    ['mango-jasmine', 'fruit', 'Mango Jasmine Tea', 'Fragrant jasmine tea bursting with tropical mango flavour.', '', [], { M: 170, L: 210 },
      { greentea: 4, mango: 60, syrup: 15 }],
    ['passion-jasmine', 'fruit', 'Passion Fruit Jasmine Tea', 'Refreshing jasmine tea with a bold, tangy passion fruit twist.', PEOPLE, [], { M: 170, L: 210 },
      { greentea: 4, passion: 40, syrup: 10 }],
    ['strawberry-lime', 'fruit', 'Strawberry & Lime Jasmine Tea', 'A refreshing fusion of sweet strawberry, zesty lime, and fragrant jasmine tea.', SIG, [], { M: 170, L: 210 },
      { greentea: 4, strawberry: 40, lime: 0.5, syrup: 10 }],
    ['lychee-paradise', 'premiumfruit', 'Lychee Paradise', 'A sunshine-inspired blend of luscious lychee jam and sweet, juicy peach flavour, infused with fragrant jasmine tea.', '', ['t-cocojelly'], { M: 220, L: 260 },
      { greentea: 4, peach: 25, lycheejam: 30, cocojelly: 40 }],
    ['passion-paradise', 'premiumfruit', 'Passion in Paradise', 'A tropical fusion of tangy passion fruit jam and sweet mango flavour, beautifully blended with fragrant jasmine tea.', SIG, ['t-cocojelly'], { M: 220, L: 260 },
      { greentea: 4, mango: 30, passionjam: 30, cocojelly: 40 }],
    ['brown-sugar', 'milktea', 'Brown Sugar Milk Tea', 'Creamy milk tea infused with rich, caramel-like brown sugar goodness.', SIG, ['t-black'], { M: 190, L: 230 },
      { blacktea: 5, milk: 120, creamer: 20, brownsyrup: 35, pearls: 30 }],
    ['mango-blush', 'milktea', 'Mango Blush', 'A tropical harmony of luscious mango jam and velvety coconut milk.', FAV, [], { M: 190, L: 230 },
      { mangojam: 40, coconutmilk: 100, milk: 60, syrup: 10 }],
    ['strawberry-bliss', 'milktea', 'Strawberry Bliss', 'Rich, creamy milk tea blended with luscious strawberry jam and juicy strawberry chunks.', SIG, [], { M: 190, L: 230 },
      { blacktea: 4, strawberryjam: 40, milk: 100, creamer: 15 }],
    ['mulberry-bliss', 'milktea', 'Mulberry Bliss', 'A smooth, creamy blend of sweet and tangy mulberry jam, delivering a velvety texture and a delightful berry finish.', '', [], { M: 210, L: 250 },
      { mulberryjam: 40, milk: 150, creamer: 15 }],
    ['very-berry', 'premiummilk', 'The Very Berry', 'A luscious medley of strawberry, blueberry, and mulberry jams, beautifully blended with creamy whole milk for a rich, fruity indulgence.', SIG, [], { M: 230, L: 270 },
      { strawberryjam: 15, blueberryjam: 15, mulberryjam: 15, milk: 160 }],
    ['premium-brown-sugar', 'premiummilk', 'Premium Brown Sugar', 'An indulgent blend of velvety evaporated milk and rich, caramel-like brown sugar, crowned with silky cold foam for an irresistibly creamy finish.', FAV, ['t-black', 't-coldfoam'], { L: 300 },
      {}, { evapmilk: 120, milk: 130, brownsyrup: 50, pearls: 50, cream: 30 }],
    ['taro-coconut', 'premiummilk', 'Taro Coconut Milk Tea', 'A creamy fusion of subtly sweet, earthy taro and smooth coconut milk, delivering a velvety texture and a distinctive tropical flavour.', PEOPLE, [], { M: 230, L: 270 },
      { blacktea: 3, taro: 25, coconutmilk: 60, milk: 80, syrup: 10 }],
    ['triple-choco', 'chocolate', 'Triple Choco Bliss', "A chocolate lover's dream! A rich, creamy chocolate blend layered with decadent chocolate sauce and chocolate chips.", '', ['t-black', 't-coffeejelly'], { M: 200, L: 250 },
      { chocpowder: 25, milk: 150, chocsauce: 20, chocchips: 10, pearls: 30, coffeejelly: 40 }],
    ['biscoff-crumble', 'chocolate', 'Biscoff Cookie Crumble', 'A rich, creamy blend of Biscoff spread, velvety cream, and a hint of vanilla, finished with crunchy cookie crumble.', '', [], { M: 240, L: 290 },
      { biscoff: 30, cream: 40, milk: 140, vanilla: 5, cookiecrumb: 10 }],
    ['blueberry-snow', 'chocolate', 'Blueberry Snow Bliss', 'A luxurious blend of velvety white chocolate and rich cream, layered with luscious blueberry compote and finished with delicate white chocolate chips for a perfect balance of creamy sweetness and fruity indulgence.', '', [], { M: 260, L: 310 },
      { whitechoc: 30, cream: 40, milk: 120, blueberryjam: 40, whitechocchips: 10 }],
    ['choco-berry-carnation', 'special', 'Choco Berry Carnation', 'A decadent blend of rich chocolate, velvety evaporated milk, and whipped cream, beautifully layered with luscious strawberry jam for the perfect balance of chocolatey richness and fruity sweetness.', '', [], { M: 340, L: 400 },
      { chocpowder: 25, chocsauce: 15, evapmilk: 120, milk: 60, cream: 30, strawberryjam: 40 }],
  ];

  // id, name, price, recipe, flavour qty, flavours [[id, name, ingredient id]] (flavour uses `qty` of its own ingredient)
  const TOPPINGS = [
    ['t-black', 'Black Tapioca Pearls', 20, { pearls: 25 }],
    ['t-golden', 'Golden Tapioca Pearls', 30, { goldpearls: 25 }],
    ['t-popping', 'Popping Balls', 50, {}, 30, [
      ['strawberry', 'Strawberry', 'pop-strawberry'], ['mango', 'Mango', 'pop-mango'],
      ['passion', 'Passion Fruit', 'pop-passion'], ['lychee', 'Lychee', 'pop-lychee']]],
    ['t-crystal', 'Crystal Balls', 40, {}, 30, [
      ['strawberry', 'Strawberry', 'crys-strawberry'], ['pomelo', 'Pomelo', 'crys-pomelo'], ['coldcream', 'Cold Cream', 'crys-cream']]],
    ['t-cocojelly', 'Coconut Jelly', 30, { cocojelly: 30 }],
    // Not sold as add-ons (off): they exist so drinks can list them as included.
    ['t-coldfoam', 'Cold Foam', 0, { cream: 30, milk: 20 }],
    ['t-coffeejelly', 'Coffee Jelly', 0, { coffeejelly: 40 }],
  ];
  const INCLUDED_ONLY = ['t-coldfoam', 't-coffeejelly'];

  /* Default recipes of the previous menu (before the November 2026 update). If a drink still has
     exactly this recipe, the update replaces it; a recipe the owner changed is kept. */
  const PREVIOUS_RECIPES = {
    'lychee-paradise': { M: { greentea: 4, peach: 25, lychee: 25, cocojelly: 40 } },
    'passion-paradise': { M: { greentea: 4, mango: 40, passion: 25, cocojelly: 40 } },
    'mango-blush': { M: { blacktea: 4, mango: 50, coconutmilk: 60, milk: 60, syrup: 10 } },
    'strawberry-bliss': { M: { blacktea: 4, strawberry: 35, milk: 100, creamer: 15 } },
    'very-berry': { M: { blacktea: 3, berry: 40, milk: 150, syrup: 10 } },
    'premium-brown-sugar': { L: { milk: 250, brownsyrup: 50, pearls: 50 } },
  };

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
    const categories = CATEGORIES.map(([id, name, color, desc], i) => ({ id, name, color, desc, sort: i }));
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
      id, name, price, recipe: toRecipe(recipe), active: !INCLUDED_ONLY.includes(id), sort: i,
      flavours: (flavours || []).map(([fid, fname, ingId]) => ({ id: fid, name: fname, active: true, recipe: [{ ingId, qty }] })),
    }));
    const settings = JSON.parse(JSON.stringify(SETTINGS));
    settings.sizes = settings.sizes.map((s) => ({ ...s, packaging: s.packaging.map(([ingId, qty]) => ({ ingId, qty })) }));
    settings.createdAt = now;
    settings.promo = { ...settings.promo, from: today, to: today };
    return { settings, ingredients, categories, items, toppings };
  }

  /* Previous default recipe for a drink size (Large = Medium ×LARGE_MULT unless given), or null. */
  function previousRecipe(itemId, sizeId) {
    const p = PREVIOUS_RECIPES[itemId];
    if (!p) return null;
    if (p[sizeId]) return toRecipe(p[sizeId]);
    if (sizeId === 'L' && p.M) return toRecipe(p.M, LARGE_MULT);
    return null;
  }

  return { build, previousRecipe, SETTINGS, LARGE_MULT };
})();
