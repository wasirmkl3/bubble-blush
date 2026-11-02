'use strict';
/* Business logic: menu cache, costing, orders, stock movements. */
const Store = (() => {
  const S = {
    settings: null,
    categories: [],
    items: [],
    toppings: [],
    ingredients: [],
    ing: {},       // id -> ingredient
    item: {},      // id -> item
    topping: {},   // id -> topping
    category: {},  // id -> category
    listeners: [],
  };

  let customerCache = null;
  const byId = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
  const sortBy = (arr) => arr.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.name).localeCompare(b.name));

  async function loadAll() {
    const [settings, categories, items, toppings, ingredients] = await Promise.all([
      DB.get('settings', 'main'), DB.all('categories'), DB.all('items'), DB.all('toppings'), DB.all('ingredients'),
    ]);
    // Fill in any settings keys added in newer versions.
    S.settings = { ...JSON.parse(JSON.stringify(Seed.SETTINGS)), ...settings };
    if (settings && settings.sizes) S.settings.sizes = settings.sizes;
    S.categories = sortBy(categories);
    S.items = sortBy(items);
    S.toppings = sortBy(toppings);
    S.ingredients = ingredients.sort((a, b) => a.name.localeCompare(b.name));
    S.ing = byId(S.ingredients);
    S.item = byId(S.items);
    S.topping = byId(S.toppings);
    S.category = byId(S.categories);
  }

  const defaultDay = () => U.dayKey(new Date(Date.now() - (Number(Seed.SETTINGS.dayStartHour) || 0) * 3600 * 1000));

  async function seed() {
    const d = Seed.build(defaultDay());
    await DB.transact(['settings', 'categories', 'items', 'toppings', 'ingredients'], (o) => {
      o.settings.put(d.settings);
      d.categories.forEach((x) => o.categories.put(x));
      d.items.forEach((x) => o.items.put(x));
      d.toppings.forEach((x) => o.toppings.put(x));
      d.ingredients.forEach((x) => o.ingredients.put(x));
    });
  }

  /* v3: replace the demo menu with the finalized Bubble Blush menu. Sales history is kept. */
  async function migrateToFinalMenu() {
    const d = Seed.build(api.businessDay());
    const [oldIngs, moves] = await Promise.all([DB.all('ingredients'), DB.all('stockMoves')]);
    const used = new Set();
    const mark = (rec) => (rec || []).forEach((r) => used.add(r.ingId));
    d.items.forEach((i) => i.sizes.forEach((z) => mark(z.recipe)));
    d.toppings.forEach((t) => { mark(t.recipe); (t.flavours || []).forEach((f) => mark(f.recipe)); });
    d.settings.sizes.forEach((z) => mark(z.packaging));
    const bought = new Set(moves.filter((m) => m.type === 'purchase').map((m) => m.ingId));
    const seedIng = Object.fromEntries(d.ingredients.map((x) => [x.id, x]));
    await DB.transact(['categories', 'items', 'toppings', 'ingredients'], (o) => {
      o.categories.clear(); o.items.clear(); o.toppings.clear();
      d.categories.forEach((x) => o.categories.put(x));
      d.items.forEach((x) => o.items.put(x));
      d.toppings.forEach((x) => o.toppings.put(x));
      const have = new Set(oldIngs.map((x) => x.id));
      oldIngs.forEach((ing) => {
        if (seedIng[ing.id]) o.ingredients.put({ ...ing, name: seedIng[ing.id].name }); // keep stock & cost
        else if (!used.has(ing.id) && !bought.has(ing.id)) o.ingredients.delete(ing.id); // old demo-only ingredient
      });
      d.ingredients.forEach((x) => { if (!have.has(x.id)) o.ingredients.put(x); });
    });
    const st = d.settings;
    await loadAll();
    await api.saveSettings({
      schema: 3, sizes: st.sizes, sugarLevels: st.sugarLevels, sugarLabels: st.sugarLabels, iceLevels: st.iceLevels,
      defaultSugar: st.defaultSugar, defaultIce: st.defaultIce, tagline: st.tagline, receiptFooter: st.receiptFooter, promo: st.promo,
    });
    localStorage.removeItem('bb-cart');
  }

  const api = {
    S,
    async init() {
      await DB.open();
      const existing = await DB.get('settings', 'main');
      if (!existing) await seed();
      await loadAll();
      // v2: the shop's bill printer is a 58 mm Rongta RP58; switch to direct printing.
      const saved = await DB.get('settings', 'main');
      if ((saved.schema || 1) < 2) {
        await api.saveSettings({ schema: 2, paperWidth: 58, printMode: 'direct' });
      }
      if ((saved.schema || 1) < 3) await migrateToFinalMenu();
      // v4: opening offer extended to Wed 21 & Thu 22 Oct 2026 (only ever lengthens it).
      if ((saved.schema || 1) < 4) {
        const p = S.settings.promo || {};
        const END = '2026-10-22';
        await api.saveSettings({
          schema: 4,
          promo: { ...p, enabled: true, from: p.from && p.from < '2026-10-21' ? p.from : '2026-10-21', to: p.to && p.to > END ? p.to : END },
        });
      }
      // v5: opening offer is over → promotion off. Cup stickers open the Edge print window
      // (no label printer at the counter), so they are no longer ticked by default.
      if ((saved.schema || 1) < 5) {
        await api.saveSettings({ schema: 5, promo: { ...(S.settings.promo || {}), enabled: false }, printStickerDefault: false });
      }
    },
    reload: loadAll,
    onChange(fn) { S.listeners.push(fn); },
    changed(what) {
      if (what === 'orders' || what === 'all') customerCache = null;
      S.listeners.forEach((fn) => { try { fn(what); } catch (e) { console.error(e); } });
    },

    get settings() { return S.settings; },
    async saveSettings(patch) {
      S.settings = { ...S.settings, ...patch, id: 'main' };
      await DB.put('settings', S.settings);
      api.changed('settings');
    },

    /* Business day: orders before `dayStartHour` (e.g. 1 AM) belong to the previous day. */
    businessDay(d = new Date()) {
      const h = Number(S.settings?.dayStartHour) || 0;
      return U.dayKey(new Date(d.getTime() - h * 3600 * 1000));
    },

    size(id) { return (S.settings.sizes || []).find((s) => s.id === id); },
    sizeLabel(id) { const s = api.size(id); return s ? s.name : id; },

    /* ---------- costing ---------- */
    recipeCost(recipe = []) {
      return U.sum(recipe, (r) => (U.n(r.qty) * U.n(S.ing[r.ingId]?.costPerUnit)));
    },
    packagingCost(sizeId) { return api.recipeCost(api.size(sizeId)?.packaging || []); },
    itemSizeCost(item, sizeId) {
      const s = item.sizes.find((x) => x.sizeId === sizeId);
      return s ? api.recipeCost(s.recipe) + api.packagingCost(sizeId) : 0;
    },
    /* Recipe for a topping (or one of its flavours). Without a flavour id, the first flavour stands in. */
    toppingRecipe(t, flavourId) {
      if (!t) return [];
      const fl = (t.flavours || []);
      const f = fl.find((x) => x.id === flavourId) || (flavourId === undefined ? fl[0] : null);
      return f && f.recipe && f.recipe.length ? f.recipe : (t.recipe || []);
    },
    toppingCost(t, flavourId) { return api.recipeCost(api.toppingRecipe(t, flavourId)); },
    includedNames(item) { return (item?.included || []).map((id) => S.topping[id]?.name).filter(Boolean); },
    /* Included toppings for an order line: saved on the order, or (older orders) from the drink's current setup. */
    lineIncluded(l) { return (l.included && l.included.length) ? l.included : api.includedNames(S.item[l.itemId]); },

    /* ---------- promotion: one free topping per drink ---------- */
    promoActive(day = api.businessDay()) {
      const p = S.settings.promo || {};
      return !!(p.enabled && p.from && p.to && day >= p.from && day <= p.to);
    },
    /* Per-cup discount: the most expensive topping the customer added (included toppings are never charged). */
    linePromo(line, active = api.promoActive()) {
      // Only drinks get the free topping (not "extra topping only" lines). One portion is free, even on a double.
      if (!active || api.isToppingLine(line) || !(line.toppings || []).length) return { amount: 0, index: -1 };
      let index = 0;
      line.toppings.forEach((t, i) => { if (U.n(t.price) > U.n(line.toppings[index].price)) index = i; });
      return { amount: U.n(line.toppings[index].price), index };
    },
    /* Price that hits a target food-cost %, rounded up to the next ৳10. */
    suggestPrice(cost, target = 0.3) { return cost > 0 ? Math.ceil(cost / target / 10) * 10 : 0; },
    /* A topping on a line can be single (1) or double (2) portion. */
    topQty(t) { return U.n(t?.qty) >= 2 ? 2 : 1; },
    topName(t) { return api.topQty(t) > 1 ? `${t.name} ×2 (double)` : t.name; },
    /* "Extra topping only" line: toppings sold without a drink (e.g. added after the drink was served). */
    isToppingLine(l) { return l?.kind === 'topping'; },
    /* Drinks only; extra-topping lines are not cups. */
    lineCups(l) { return api.isToppingLine(l) ? 0 : U.n(l.qty); },
    lineCost(line) {
      const item = api.isToppingLine(line) ? null : S.item[line.itemId];
      const base = item ? api.itemSizeCost(item, line.sizeId) : 0;
      const tops = U.sum(line.toppings || [], (t) => api.toppingCost(S.topping[t.id], t.flavourId || null) * api.topQty(t));
      return (base + tops) * line.qty;
    },
    lineUnitPrice(line) { return U.n(line.basePrice) + U.sum(line.toppings || [], (t) => U.n(t.price) * api.topQty(t)); },

    /* Ingredients used by a cart line, as {ingId: qty}. */
    lineUsage(line, into = {}) {
      const add = (recipe, mult) => (recipe || []).forEach((r) => {
        if (!r.ingId) return;
        into[r.ingId] = (into[r.ingId] || 0) + U.n(r.qty) * mult;
      });
      if (!api.isToppingLine(line)) {
        const item = S.item[line.itemId];
        const sz = item?.sizes.find((x) => x.sizeId === line.sizeId);
        add(sz?.recipe, line.qty);
        add(api.size(line.sizeId)?.packaging, line.qty);
      }
      (line.toppings || []).forEach((t) => add(api.toppingRecipe(S.topping[t.id], t.flavourId || null), line.qty * api.topQty(t)));
      return into;
    },

    /* ---------- totals ---------- */
    /* extras: { delivery, packaging } = charges typed in by hand (added after discount, no VAT). */
    totals(lines, discount, extras = {}, promoOn = api.promoActive()) {
      const st = S.settings;
      const delivery = Math.max(0, Math.round(U.n(extras?.delivery)));
      const packaging = Math.max(0, Math.round(U.n(extras?.packaging)));
      const subtotal = U.sum(lines, (l) => api.lineUnitPrice(l) * l.qty);
      const promo = U.sum(lines, (l) => api.linePromo(l, promoOn).amount * l.qty);
      const afterPromo = subtotal - promo;
      let discAmt = 0;
      if (discount && discount.value > 0) {
        discAmt = discount.type === 'pct' ? afterPromo * discount.value / 100 : discount.value;
      }
      discAmt = Math.min(afterPromo, Math.round(discAmt));
      const afterDisc = afterPromo - discAmt;
      const pct = U.n(st.vatPct);
      let vat = 0;
      let total = afterDisc;
      if (pct > 0) {
        if (st.vatMode === 'inclusive') vat = U.round(afterDisc - afterDisc / (1 + pct / 100));
        else { vat = Math.round(afterDisc * pct / 100); total = afterDisc + vat; }
      }
      return {
        subtotal, promo, discount: discAmt, vat, delivery, packaging,
        total: Math.round(total) + delivery + packaging,
        cups: U.sum(lines, (l) => api.lineCups(l)),
      };
    },

    /* ---------- orders ---------- */
    async nextOrderNo(dayKey) {
      const today = await DB.byIndex('orders', 'dayKey', dayKey);
      return today.reduce((m, o) => Math.max(m, o.no || 0), 0) + 1;
    },

    /* payLater: the drinks go to the kitchen now, payment is taken later (status 'unpaid'). */
    async placeOrder({ lines, discount, orderType, customerName, customerPhone, payMethod, received, note, payLater = false, deliveryCharge = 0, packagingCharge = 0 }) {
      const now = new Date();
      const dayKey = api.businessDay(now);
      const promoOn = api.promoActive(dayKey);
      const t = api.totals(lines, discount, { delivery: deliveryCharge, packaging: packagingCharge }, promoOn);
      const no = await api.nextOrderNo(dayKey);
      const orderLines = lines.map((l) => {
        const pr = api.linePromo(l, promoOn);
        const topLine = api.isToppingLine(l);
        return {
          kind: topLine ? 'topping' : 'drink',
          itemId: topLine ? null : l.itemId,
          name: l.name,
          sizeId: topLine ? null : l.sizeId,
          sizeName: topLine ? '' : api.sizeLabel(l.sizeId),
          basePrice: topLine ? 0 : l.basePrice,
          parcel: !!l.parcel,
          toppings: (l.toppings || []).map((x) => ({ id: x.id, flavourId: x.flavourId || null, name: x.name, price: x.price, qty: api.topQty(x) })),
          included: topLine ? [] : api.includedNames(S.item[l.itemId]),
          sugar: l.sugar || '',
          ice: l.ice || '',
          note: l.note || '',
          qty: l.qty,
          unitPrice: api.lineUnitPrice(l),
          promo: pr.amount,          // per cup
          promoIndex: pr.index,      // which topping was free
          lineGross: api.lineUnitPrice(l) * l.qty,
          lineTotal: (api.lineUnitPrice(l) - pr.amount) * l.qty,
          cost: U.round(api.lineCost(l)),
        };
      });
      const usage = {};
      lines.forEach((l) => api.lineUsage(l, usage));
      const order = {
        id: U.uid(),
        no,
        dayKey,
        at: now.toISOString(),
        orderType: orderType || 'Takeaway',
        customerName: (customerName || '').trim(),
        customerPhone: (customerPhone || '').replace(/\s+/g, ''),
        note: note || '',
        lines: orderLines,
        cups: t.cups,
        subtotal: t.subtotal,
        promo: t.promo,
        promoName: t.promo ? (S.settings.promo?.name || 'Promotion') : '',
        discount: t.discount,
        discountInfo: discount && discount.value > 0 ? { ...discount } : null,
        vat: t.vat,
        vatPct: U.n(S.settings.vatPct),
        vatMode: S.settings.vatMode,
        deliveryCharge: t.delivery,
        packagingCharge: t.packaging,
        total: t.total,
        cost: U.round(U.sum(orderLines, (l) => l.cost)),
        payMethod: payLater ? '' : (payMethod || 'Cash'),
        received: payLater ? 0 : payMethod === 'Cash' ? Math.max(U.n(received), t.total) : t.total,
        change: !payLater && payMethod === 'Cash' ? Math.max(0, U.n(received) - t.total) : 0,
        status: payLater ? 'unpaid' : 'paid',
        ready: false,
        usage,
      };
      await DB.transact(['orders', 'ingredients', 'stockMoves'], (o) => {
        o.orders.put(order);
        Object.entries(usage).forEach(([ingId, qty]) => {
          const ing = S.ing[ingId];
          if (!ing) return;
          ing.stock = U.round(U.n(ing.stock) - qty, 3);
          o.ingredients.put(ing);
          o.stockMoves.put({
            id: U.uid(), ingId, dayKey, at: order.at, type: 'sale', qty: -U.round(qty, 3),
            value: -U.round(qty * U.n(ing.costPerUnit)), orderId: order.id, note: `Order #${no}`,
          });
        });
      });
      api.changed('orders');
      api.changed('stock');
      return order;
    },

    async voidOrder(order, reason, restock = true) {
      if (order.status === 'void') return order;
      const now = new Date();
      order.status = 'void';
      order.voidReason = reason || '';
      order.voidAt = now.toISOString();
      order.restocked = !!restock;
      await DB.transact(['orders', 'ingredients', 'stockMoves'], (o) => {
        o.orders.put(order);
        if (!restock) return;
        Object.entries(order.usage || {}).forEach(([ingId, qty]) => {
          const ing = S.ing[ingId];
          if (!ing) return;
          ing.stock = U.round(U.n(ing.stock) + qty, 3);
          o.ingredients.put(ing);
          o.stockMoves.put({
            id: U.uid(), ingId, dayKey: api.businessDay(now), at: order.voidAt, type: 'void', qty: U.round(qty, 3),
            value: U.round(qty * U.n(ing.costPerUnit)), orderId: order.id, note: `Void #${order.no}`,
          });
        });
      });
      api.changed('orders');
      api.changed('stock');
      return order;
    },

    /* Take payment for an order that was sent to the kitchen first. */
    async payOrder(order, { payMethod, received, ref, customerName, customerPhone }) {
      if (order.status !== 'unpaid') throw new Error(`Order #${order.no} is not waiting for payment`);
      const pm = payMethod || 'Cash';
      order.status = 'paid';
      order.paidAt = new Date().toISOString();
      order.payMethod = pm;
      order.received = pm === 'Cash' ? Math.max(U.n(received), order.total) : order.total;
      order.change = pm === 'Cash' ? Math.max(0, U.n(received) - order.total) : 0;
      if (customerName !== undefined) order.customerName = (customerName || '').trim();
      if (customerPhone !== undefined) order.customerPhone = (customerPhone || '').replace(/\s+/g, '');
      if (ref) order.note = [order.note, `TrxID: ${ref}`].filter(Boolean).join(' · ');
      await DB.put('orders', order);
      api.changed('orders');
      return order;
    },

    async markKitchenPrinted(order) {
      order.kitchenAt = new Date().toISOString();
      await DB.put('orders', order);
      api.changed('orders');
    },

    async setReady(order, ready = true) {
      order.ready = ready;
      order.readyAt = ready ? new Date().toISOString() : null;
      await DB.put('orders', order);
      api.changed('orders');
    },

    ordersBetween(fromDay, toDay) { return DB.byRange('orders', 'dayKey', fromDay, toDay); },
    expensesBetween(fromDay, toDay) { return DB.byRange('expenses', 'dayKey', fromDay, toDay); },
    movesBetween(fromDay, toDay) { return DB.byRange('stockMoves', 'dayKey', fromDay, toDay); },

    async customerStats(phone, excludeOrderId = null) {
      const p = (phone || '').replace(/\s+/g, '');
      if (p.length < 6) return null;
      const orders = (await DB.byIndex('orders', 'customerPhone', p)).filter((o) => o.status !== 'void' && o.id !== excludeOrderId);
      if (!orders.length) return { visits: 0, cups: 0, spent: 0, name: '' };
      orders.sort((a, b) => a.at.localeCompare(b.at));
      return {
        visits: orders.length,
        cups: U.sum(orders, (o) => o.cups),
        spent: U.sum(orders, (o) => o.total),
        name: [...orders].reverse().find((o) => o.customerName)?.customerName || '',
        last: orders[orders.length - 1].at,
      };
    },

    /* Every customer seen on past orders (by phone; name-only customers by name), newest first. */
    async customers() {
      if (customerCache) return customerCache;
      const orders = (await DB.all('orders')).filter((o) => o.status !== 'void' && (o.customerName || o.customerPhone));
      orders.sort((a, b) => a.at.localeCompare(b.at));
      const map = new Map();
      orders.forEach((o) => {
        const phone = (o.customerPhone || '').replace(/\s+/g, '');
        const name = (o.customerName || '').trim();
        const key = phone ? 'p:' + phone : 'n:' + name.toLowerCase();
        const c = map.get(key) || { phone, name: '', visits: 0, cups: 0, spent: 0, last: '' };
        c.visits++; c.cups += U.n(o.cups); c.spent += U.n(o.total); c.last = o.at;
        if (name) c.name = name; // latest name wins
        map.set(key, c);
      });
      customerCache = [...map.values()].sort((a, b) => b.last.localeCompare(a.last));
      return customerCache;
    },
    /* Search customers by part of the name or phone number. */
    async findCustomers(q, limit = 8) {
      const s = String(q || '').trim().toLowerCase();
      if (!s) return [];
      const digits = s.replace(/\D/g, '');
      const all = await api.customers();
      const hit = (c) => (c.name && c.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(s))) ? 2
        : (c.name && c.name.toLowerCase().includes(s)) || (digits.length >= 3 && c.phone.includes(digits)) ? 1 : 0;
      return all.map((c) => ({ c, h: hit(c) })).filter((x) => x.h)
        .sort((a, b) => b.h - a.h || b.c.visits - a.c.visits).slice(0, limit).map((x) => x.c);
    },

    /* ---------- stock ---------- */
    /* Purchase: qty in base units, total cost in ৳. Updates weighted-average cost. */
    async stockIn(ingId, qty, totalCost, note = '', dayKey = api.businessDay()) {
      const ing = S.ing[ingId];
      qty = U.n(qty); totalCost = U.n(totalCost);
      if (!ing || qty <= 0) throw new Error('Enter a quantity above zero');
      const oldStock = Math.max(0, U.n(ing.stock));
      if (totalCost > 0) {
        const newCost = (oldStock * U.n(ing.costPerUnit) + totalCost) / (oldStock + qty);
        ing.costPerUnit = U.round(newCost, 4);
        ing.lastPrice = U.round(totalCost / qty, 4);
      }
      ing.stock = U.round(U.n(ing.stock) + qty, 3);
      await DB.transact(['ingredients', 'stockMoves'], (o) => {
        o.ingredients.put(ing);
        o.stockMoves.put({ id: U.uid(), ingId, dayKey, at: new Date().toISOString(), type: 'purchase', qty, value: totalCost, note });
      });
      api.changed('stock');
    },

    /* Waste / correction: delta can be negative or positive. */
    async adjustStock(ingId, delta, type = 'waste', note = '') {
      const ing = S.ing[ingId];
      delta = U.n(delta);
      if (!ing || !delta) return;
      ing.stock = U.round(U.n(ing.stock) + delta, 3);
      await DB.transact(['ingredients', 'stockMoves'], (o) => {
        o.ingredients.put(ing);
        o.stockMoves.put({
          id: U.uid(), ingId, dayKey: api.businessDay(), at: new Date().toISOString(), type, qty: U.round(delta, 3),
          value: U.round(delta * U.n(ing.costPerUnit)), note,
        });
      });
      api.changed('stock');
    },

    /* Physical count: counts = {ingId: actualQty} */
    async stockCount(counts, note = 'Stock count') {
      const now = new Date().toISOString();
      const dayKey = api.businessDay();
      let changedCount = 0;
      await DB.transact(['ingredients', 'stockMoves'], (o) => {
        Object.entries(counts).forEach(([ingId, actual]) => {
          const ing = S.ing[ingId];
          if (!ing) return;
          const delta = U.round(U.n(actual) - U.n(ing.stock), 3);
          if (!delta) return;
          changedCount++;
          ing.stock = U.round(U.n(actual), 3);
          o.ingredients.put(ing);
          o.stockMoves.put({ id: U.uid(), ingId, dayKey, at: now, type: 'count', qty: delta, value: U.round(delta * U.n(ing.costPerUnit)), note });
        });
      });
      api.changed('stock');
      return changedCount;
    },

    stockStatus(ing) {
      const s = U.n(ing.stock);
      if (s <= 0) return 'out';
      if (s <= U.n(ing.lowAt)) return 'low';
      return 'ok';
    },
    lowStock() { return S.ingredients.filter((i) => i.active !== false && api.stockStatus(i) !== 'ok'); },

    /* Is an item sellable with current stock? Returns ingredients that are out. */
    missingFor(item, sizeId) {
      const sz = item.sizes.find((x) => x.sizeId === sizeId) || item.sizes[0];
      if (!sz) return [];
      const need = [...(sz.recipe || []), ...(api.size(sz.sizeId)?.packaging || [])];
      return need.filter((r) => S.ing[r.ingId] && U.n(S.ing[r.ingId].stock) < U.n(r.qty)).map((r) => S.ing[r.ingId].name);
    },

    /* ---------- generic save helpers ---------- */
    async save(store, obj) {
      await DB.put(store, obj);
      await loadAll();
      api.changed(store);
    },
    async remove(store, id) {
      await DB.del(store, id);
      await loadAll();
      api.changed(store);
    },

    /* ---------- backup ---------- */
    async exportAll() {
      const out = { app: 'bubble-blush-pos', version: 1, exportedAt: new Date().toISOString(), data: {} };
      for (const s of DB.STORES) out.data[s] = await DB.all(s);
      return out;
    },
    async importAll(json) {
      if (!json || json.app !== 'bubble-blush-pos' || !json.data) throw new Error('This is not a Bubble Blush POS backup file.');
      await DB.transact(DB.STORES, (o) => {
        DB.STORES.forEach((s) => {
          o[s].clear();
          (json.data[s] || []).forEach((row) => o[s].put(row));
        });
      });
      await loadAll();
      api.changed('all');
    },
    async clearSales() {
      const stores = ['orders', 'stockMoves', 'expenses', 'dayCloses'];
      await DB.transact(stores, (o) => stores.forEach((s) => o[s].clear()));
      api.changed('all');
    },
    async resetEverything() {
      await DB.transact(DB.STORES, (o) => DB.STORES.forEach((s) => o[s].clear()));
      await seed();
      await loadAll();
      api.changed('all');
    },
  };
  return api;
})();
