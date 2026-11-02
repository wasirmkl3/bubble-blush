'use strict';
/* Reports: sales, profit, best sellers, busy hours, payments, cash drawer and day close. */
Views.reports = (() => {
  let root = null;
  let preset = 'today';
  let range = null;
  let data = null;

  function presetRange(p) {
    const today = Store.businessDay();
    const d = U.parseDay(today);
    switch (p) {
      case 'yesterday': { const y = U.addDays(today, -1); return [y, y]; }
      case 'week': return [U.addDays(today, -6), today];
      case 'month': return [`${U.monthKey(d)}-01`, today];
      case 'lastmonth': {
        const lm = new Date(d.getFullYear(), d.getMonth() - 1, 1);
        const end = new Date(d.getFullYear(), d.getMonth(), 0);
        return [U.dayKey(lm), U.dayKey(end)];
      }
      case '30': return [U.addDays(today, -29), today];
      default: return [today, today];
    }
  }

  function summarize(orders, expenses, moves) {
    // Sales count only paid orders. "Kitchen first, pay later" orders count once they are paid.
    const paid = orders.filter((o) => o.status !== 'void' && o.status !== 'unpaid');
    const voids = orders.filter((o) => o.status === 'void');
    const unpaid = orders.filter((o) => o.status === 'unpaid');
    const r = {
      orders: paid.length,
      cups: U.sum(paid, (o) => o.cups),
      gross: U.sum(paid, (o) => o.subtotal),
      discount: U.sum(paid, (o) => o.discount),
      promo: U.sum(paid, (o) => o.promo || 0),
      promoCups: U.sum(paid, (o) => U.sum(o.lines, (l) => (l.promo ? l.qty : 0))),
      vat: U.sum(paid, (o) => o.vat),
      collected: U.sum(paid, (o) => o.total),
      cogs: U.round(U.sum(paid, (o) => o.cost)),
      voids: voids.length,
      voidValue: U.sum(voids, (o) => o.total),
      unpaid: unpaid.length,
      unpaidValue: U.sum(unpaid, (o) => o.total),
      discountedOrders: paid.filter((o) => o.discount > 0).length,
      deliveryCharges: U.sum(paid, (o) => o.deliveryCharge || 0),
      packagingCharges: U.sum(paid, (o) => o.packagingCharge || 0),
      parcelCups: U.sum(paid, (o) => U.sum(o.lines, (l) => (l.parcel ? Store.lineCups(l) : 0))),
    };
    r.net = r.collected;
    r.revenue = r.collected - r.vat;
    r.grossProfit = r.revenue - r.cogs;
    r.avgOrder = r.orders ? r.collected / r.orders : 0;
    r.opExpenses = U.sum(expenses.filter((x) => !x.isStock), (x) => x.amount);
    r.expenses = r.opExpenses;
    r.netProfit = r.grossProfit - r.opExpenses;
    r.stockPurchased = U.sum(moves.filter((m) => m.type === 'purchase'), (m) => m.value);
    r.wasteValue = -U.sum(moves.filter((m) => m.type === 'waste'), (m) => m.value);
    r.countDiff = U.sum(moves.filter((m) => m.type === 'count' || m.type === 'adjust'), (m) => m.value);
    r.cashSales = U.sum(paid.filter((o) => o.payMethod === 'Cash'), (o) => o.total);
    r.cashExpenses = U.sum(expenses.filter((x) => x.fromDrawer), (x) => x.amount);

    const group = (keyFn, init) => {
      const m = {};
      paid.forEach((o) => keyFn(o, m, init));
      return m;
    };
    const pay = group((o, m) => { const k = o.payMethod; m[k] = m[k] || { method: k, count: 0, amount: 0 }; m[k].count++; m[k].amount += o.total; });
    r.payments = Object.values(pay).sort((a, b) => b.amount - a.amount);
    const types = group((o, m) => { const k = o.orderType; m[k] = m[k] || { name: k, count: 0, amount: 0 }; m[k].count++; m[k].amount += o.total; });
    r.orderTypes = Object.values(types).sort((a, b) => b.amount - a.amount);

    const items = {}; const tops = {}; const sizes = {}; const cats = {};
    paid.forEach((o) => o.lines.forEach((l) => {
      (l.toppings || []).forEach((t) => {
        const q = l.qty * Store.topQty(t);
        tops[t.name] = tops[t.name] || { name: t.name, qty: 0, sales: 0 };
        tops[t.name].qty += q; tops[t.name].sales += t.price * q;
      });
      if (Store.isToppingLine(l)) return; // extra toppings without a drink: counted under toppings only
      const k = l.itemId + '|' + l.name;
      items[k] = items[k] || { name: l.name, qty: 0, sales: 0, cost: 0 };
      items[k].qty += l.qty; items[k].sales += l.lineTotal; items[k].cost += l.cost;
      sizes[l.sizeName] = (sizes[l.sizeName] || 0) + l.qty;
      const cat = Store.S.category[Store.S.item[l.itemId]?.catId]?.name || 'Other';
      cats[cat] = cats[cat] || { name: cat, qty: 0, sales: 0 };
      cats[cat].qty += l.qty; cats[cat].sales += l.lineTotal;
    }));
    r.topItems = Object.values(items).sort((a, b) => b.qty - a.qty || b.sales - a.sales);
    r.toppings = Object.values(tops).sort((a, b) => b.qty - a.qty);
    r.sizes = Object.entries(sizes).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty);
    r.categories = Object.values(cats).sort((a, b) => b.sales - a.sales);

    r.hours = Array.from({ length: 24 }, (_, h) => ({ h, orders: 0, sales: 0 }));
    paid.forEach((o) => { const h = new Date(o.at).getHours(); r.hours[h].orders++; r.hours[h].sales += o.total; });
    const days = {};
    paid.forEach((o) => { days[o.dayKey] = days[o.dayKey] || { day: o.dayKey, orders: 0, sales: 0 }; days[o.dayKey].orders++; days[o.dayKey].sales += o.total; });
    r.days = days;
    const wk = Array.from({ length: 7 }, (_, i) => ({ i, sales: 0, days: new Set() }));
    paid.forEach((o) => { const d = U.parseDay(o.dayKey).getDay(); wk[d].sales += o.total; wk[d].days.add(o.dayKey); });
    r.weekdays = wk;

    const usage = {};
    moves.filter((m) => m.type === 'sale' || m.type === 'void').forEach((m) => {
      usage[m.ingId] = usage[m.ingId] || { qty: 0, value: 0 };
      usage[m.ingId].qty -= m.qty; usage[m.ingId].value -= m.value;
    });
    r.usage = Object.entries(usage).map(([id, v]) => ({ id, name: Store.S.ing[id]?.name || '(deleted)', unit: Store.S.ing[id]?.unit || '', ...v }))
      .filter((u) => u.qty > 0).sort((a, b) => b.value - a.value);

    const custs = {};
    paid.filter((o) => o.customerPhone).forEach((o) => {
      const c = custs[o.customerPhone] = custs[o.customerPhone] || { phone: o.customerPhone, name: '', visits: 0, cups: 0, spent: 0 };
      c.visits++; c.cups += o.cups; c.spent += o.total; if (o.customerName) c.name = o.customerName;
    });
    r.customers = Object.values(custs).sort((a, b) => b.spent - a.spent);
    r.withPhone = paid.filter((o) => o.customerPhone).length;
    return r;
  }

  async function render(el) {
    root = el;
    range = range || presetRange(preset);
    el.innerHTML = `
      <div class="page-head"><h1>Reports</h1>
        <div class="tools">
          <div class="chips" id="rPresets">${[['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'Last 7 days'], ['month', 'This month'], ['lastmonth', 'Last month'], ['30', 'Last 30 days']]
            .map(([k, l]) => `<button class="chip ${preset === k ? 'on' : ''}" data-p="${k}">${l}</button>`).join('')}</div>
          <input type="date" id="rFrom" value="${range[0]}"> – <input type="date" id="rTo" value="${range[1]}">
        </div></div>
      <div id="rBody"><p class="empty">Loading…</p></div>`;
    U.$('#rPresets', el).onclick = (e) => {
      const b = e.target.closest('[data-p]');
      if (!b) return;
      preset = b.dataset.p; range = presetRange(preset);
      render(el);
    };
    const custom = () => {
      preset = 'custom';
      let a = U.$('#rFrom', el).value; let b = U.$('#rTo', el).value;
      if (a > b) [a, b] = [b, a];
      range = [a, b];
      render(el);
    };
    U.$('#rFrom', el).onchange = custom;
    U.$('#rTo', el).onchange = custom;
    await load();
  }

  async function load() {
    const [from, to] = range;
    const [orders, expenses, moves, closes] = await Promise.all([
      Store.ordersBetween(from, to), Store.expensesBetween(from, to), Store.movesBetween(from, to), DB.all('dayCloses'),
    ]);
    data = { orders, expenses, moves, r: summarize(orders, expenses, moves), close: from === to ? closes.find((c) => c.id === from) : null };
    draw();
  }

  const bars = (rows, label, value, fmt = U.money) => {
    const max = Math.max(1, ...rows.map(value));
    return rows.map((x) => `<div class="bar-row"><span>${label(x)}</span><div class="bar"><i style="width:${(value(x) / max) * 100}%"></i></div><b>${fmt(value(x))}</b></div>`).join('');
  };

  function draw() {
    const { r, close } = data;
    const [from, to] = range;
    const single = from === to;
    const nDays = Math.round((U.parseDay(to) - U.parseDay(from)) / 86400000) + 1;
    const gm = r.revenue ? r.grossProfit / r.revenue : 0;
    const hours = r.hours.filter((h) => h.orders);
    const hourSpan = hours.length ? r.hours.slice(hours[0].h, hours[hours.length - 1].h + 1) : [];
    const dayRows = [];
    if (!single) for (let d = from; d <= to; d = U.addDays(d, 1)) dayRows.push(r.days[d] || { day: d, orders: 0, sales: 0 });
    const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const body = U.$('#rBody', root);
    body.innerHTML = `
      <div class="row-between mb">
        <h2 class="range-title">${single ? U.fmtDay(from) : `${U.fmtDay(from)} → ${U.fmtDay(to)} <small class="muted">(${nDays} days)</small>`}</h2>
        <div class="tools">
          ${single ? `<button class="btn ${close ? 'ghost' : 'primary'}" id="rClose">${close ? '✓ Day closed — view' : '🔒 Close the day'}</button>` : ''}
          <button class="btn ghost" id="rPrint">🖨 Print summary</button>
          <button class="btn ghost" id="rCsvO">⬇ Orders CSV</button>
          <button class="btn ghost" id="rCsvI">⬇ Items CSV</button>
        </div>
      </div>
      <div class="stat-row">
        <div class="stat big"><span>Sales collected</span><b>${U.money(r.collected)}</b><small>${r.orders} orders · ${r.cups} cups</small></div>
        <div class="stat"><span>Avg. order</span><b>${U.money(r.avgOrder)}</b><small>${r.orders ? U.qty(r.cups / r.orders) : 0} cups/order</small></div>
        <div class="stat"><span>Ingredient cost</span><b>${U.money(r.cogs)}</b><small>${U.pct(r.revenue ? r.cogs / r.revenue : 0)} of sales</small></div>
        <div class="stat good"><span>Gross profit</span><b>${U.money(r.grossProfit)}</b><small>margin ${U.pct(gm)}</small></div>
        <div class="stat"><span>Expenses</span><b>${U.money(r.opExpenses)}</b><small>rent, salary, bills…</small></div>
        <div class="stat ${r.netProfit >= 0 ? 'good' : 'bad'}"><span>Net profit</span><b>${U.money(r.netProfit)}</b><small>after expenses</small></div>
      </div>
      ${!single ? `<div class="card mb"><h3>Daily sales <small class="muted">avg ${U.money(r.collected / nDays)} per day</small></h3><div class="vbars">${(() => {
        const max = Math.max(1, ...dayRows.map((d) => d.sales));
        return dayRows.map((d) => `<div class="vb" title="${U.fmtDay(d.day)}: ${U.money(d.sales)} · ${d.orders} orders"><i style="height:${(d.sales / max) * 100}%"></i><span>${U.parseDay(d.day).getDate()}</span></div>`).join('');
      })()}</div></div>` : ''}
      <div class="grid3">
        <div class="card"><h3>🏆 Best sellers</h3>${r.topItems.length ? `<table class="tbl compact"><thead><tr><th>Drink</th><th class="r">Cups</th><th class="r">Sales</th><th class="r">Profit</th></tr></thead>
          <tbody>${r.topItems.slice(0, 12).map((i) => `<tr><td>${U.esc(i.name)}</td><td class="r">${i.qty}</td><td class="r">${U.money(i.sales)}</td><td class="r">${U.money(i.sales - i.cost)}</td></tr>`).join('')}</tbody></table>`
          : '<p class="muted">No sales yet.</p>'}
          ${r.topItems.length > 3 ? `<p class="muted small mt">Slowest: ${r.topItems.slice(-3).reverse().map((i) => `${U.esc(i.name)} (${i.qty})`).join(', ')}</p>` : ''}</div>
        <div class="card"><h3>⏰ Busy hours</h3>${hourSpan.length ? bars(hourSpan, (h) => `${((h.h + 11) % 12) + 1}${h.h < 12 ? 'am' : 'pm'}`, (h) => h.orders, (v) => `${v} orders`) : '<p class="muted">No sales yet.</p>'}</div>
        <div class="card"><h3>💳 Payments</h3>${r.payments.length ? bars(r.payments, (p) => `${U.esc(p.method)} <small>(${p.count})</small>`, (p) => p.amount) : '<p class="muted">No payments yet.</p>'}
          <h3 class="mt">🛍 Order type</h3>${r.orderTypes.length ? bars(r.orderTypes, (t) => `${U.esc(t.name)} <small>(${t.count})</small>`, (t) => t.amount) : '<p class="muted">—</p>'}</div>
        <div class="card"><h3>📂 Categories</h3>${r.categories.length ? bars(r.categories, (c) => `${U.esc(c.name)} <small>(${c.qty})</small>`, (c) => c.sales) : '<p class="muted">—</p>'}
          <h3 class="mt">📏 Sizes</h3>${r.sizes.length ? bars(r.sizes, (s) => U.esc(s.name), (s) => s.qty, (v) => `${v} cups`) : '<p class="muted">—</p>'}</div>
        <div class="card"><h3>🧋 Toppings</h3>${r.toppings.length ? bars(r.toppings, (t) => U.esc(t.name), (t) => t.qty, (v) => `${v}×`) : '<p class="muted">No toppings sold yet.</p>'}
          ${r.cups ? `<p class="muted small mt">${U.pct(U.sum(r.toppings, (t) => t.qty) / r.cups)} topping attach rate — suggest a topping with every order!</p>` : ''}</div>
        <div class="card"><h3>💰 Money summary</h3>
          <div class="tot-row"><span>Gross sales (menu price)</span><span>${U.money(r.gross)}</span></div>
          ${r.promo ? `<div class="tot-row disc"><span>Promotion (${r.promoCups} free toppings)</span><span>-${U.money(r.promo)}</span></div>` : ''}
          <div class="tot-row disc"><span>Discounts (${r.discountedOrders} orders)</span><span>-${U.money(r.discount)}</span></div>
          ${r.vat ? `<div class="tot-row"><span>VAT collected</span><span>${U.money(r.vat)}</span></div>` : ''}
          ${r.deliveryCharges ? `<div class="tot-row"><span>Delivery charges</span><span>${U.money(r.deliveryCharges)}</span></div>` : ''}
          ${r.packagingCharges ? `<div class="tot-row"><span>Packaging charges</span><span>${U.money(r.packagingCharges)}</span></div>` : ''}
          ${r.parcelCups ? `<div class="tot-row muted"><span>Parcel cups</span><span>${r.parcelCups}</span></div>` : ''}
          <div class="tot-row"><span><b>Collected</b></span><span><b>${U.money(r.collected)}</b></span></div>
          <div class="tot-row"><span>Ingredient &amp; packaging cost</span><span>-${U.money(r.cogs)}</span></div>
          <div class="tot-row"><span>Operating expenses</span><span>-${U.money(r.opExpenses)}</span></div>
          <div class="tot-row grand"><span>Net profit</span><span>${U.money(r.netProfit)}</span></div>
          <div class="tot-row muted"><span>Stock purchased (cash spent on stock)</span><span>${U.money(r.stockPurchased)}</span></div>
          <div class="tot-row muted"><span>Waste &amp; staff drinks</span><span>${U.money(r.wasteValue)}</span></div>
          ${r.voids ? `<div class="tot-row muted"><span>Voided orders (${r.voids})</span><span>${U.money(r.voidValue)}</span></div>` : ''}
          ${r.unpaid ? `<div class="tot-row err"><span>Not paid yet (${r.unpaid}) · not in sales</span><span>${U.money(r.unpaidValue)}</span></div>` : ''}
        </div>
        ${!single && nDays >= 7 ? `<div class="card"><h3>📅 Weekdays <small class="muted">avg per day</small></h3>${bars(r.weekdays.filter((w) => w.days.size), (w) => WD[w.i], (w) => w.sales / w.days.size)}</div>` : ''}
        <div class="card"><h3>💙 Customers</h3>
          <p class="muted small">${r.withPhone} of ${r.orders} orders had a phone number. Collect numbers to offer loyalty rewards!</p>
          ${r.customers.length ? `<table class="tbl compact"><thead><tr><th>Customer</th><th class="r">Visits</th><th class="r">Cups</th><th class="r">Spent</th></tr></thead>
            <tbody>${r.customers.slice(0, 10).map((c) => `<tr><td>${U.esc(c.name || '—')}<br><small class="muted">${U.esc(c.phone)}</small></td><td class="r">${c.visits}</td><td class="r">${c.cups}</td><td class="r">${U.money(c.spent)}</td></tr>`).join('')}</tbody></table>` : ''}</div>
        <div class="card"><h3>📦 Ingredients used</h3>${r.usage.length ? `<table class="tbl compact"><thead><tr><th>Ingredient</th><th class="r">Used</th><th class="r">Cost</th></tr></thead>
          <tbody>${r.usage.slice(0, 15).map((u) => `<tr><td>${U.esc(u.name)}</td><td class="r">${U.qty(u.qty)} ${U.esc(u.unit)}</td><td class="r">${U.money(u.value)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">—</p>'}</div>
      </div>`;

    U.$('#rPrint', body).onclick = () => Print.dayReport({ ...r, title: single ? 'Daily summary' : 'Sales summary', range: single ? U.fmtDay(from) : `${from} to ${to}`, ...(close || {}), expectedCash: (close?.openingCash || 0) + r.cashSales - r.cashExpenses, countedCash: close ? close.countedCash : null });
    U.$('#rCsvO', body).onclick = () => U.download(`orders-${from}_to_${to}.csv`, U.toCSV([
      ['Date', 'Time', 'Order #', 'Status', 'Type', 'Customer', 'Phone', 'Cups', 'Items', 'Subtotal', 'Discount', 'VAT', 'Total', 'Payment', 'Ingredient cost', 'Note'],
      ...data.orders.sort((a, b) => a.at.localeCompare(b.at)).map((o) => [o.dayKey, U.fmtTime(o.at), o.no, o.status, o.orderType, o.customerName, o.customerPhone, o.cups,
        o.lines.map((l) => `${l.qty}x ${l.name}${l.sizeName ? ` (${l.sizeName})` : ''}${l.parcel ? ' [parcel]' : ''}`).join('; '), o.subtotal, o.discount, o.vat, o.total, o.payMethod, o.cost, o.note || '']),
    ]), 'text/csv');
    U.$('#rCsvI', body).onclick = () => U.download(`items-${from}_to_${to}.csv`, U.toCSV([
      ['Drink', 'Cups sold', 'Sales (BDT)', 'Ingredient cost (BDT)', 'Profit (BDT)'],
      ...r.topItems.map((i) => [i.name, i.qty, i.sales, U.round(i.cost), U.round(i.sales - i.cost)]),
    ]), 'text/csv');
    const cb = U.$('#rClose', body);
    if (cb) cb.onclick = () => closeDay(from, r, close);
  }

  function closeDay(day, r, existing) {
    const prev = existing || {};
    const md = U.modal({
      title: `🔒 Close the day — ${U.fmtDay(day)}`,
      wide: true,
      body: `${r.unpaid ? `<div class="banner low">💰 ${r.unpaid} order${r.unpaid === 1 ? ' is' : 's are'} not paid yet (${U.money(r.unpaidValue)}). Take the payment from <b>Orders</b> first, or void ${r.unpaid === 1 ? 'it' : 'them'}.</div>` : ''}
        <div class="form-grid">
          <div><label>Opening cash in drawer (morning float) ৳</label><input type="number" id="dcOpen" min="0" step="any" value="${prev.openingCash ?? ''}" autofocus></div>
          <div><label>Cash counted now ৳</label><input type="number" id="dcCount" min="0" step="any" value="${prev.countedCash ?? ''}"></div>
          <div class="span2"><label>Note</label><input type="text" id="dcNote" value="${U.esc(prev.note || '')}" placeholder="Anything unusual today?"></div>
        </div>
        <div class="tot-box mt" id="dcBox"></div>
        <label class="check mt"><input type="checkbox" id="dcPrint" checked> Print day report on the receipt printer</label>
        <label class="check"><input type="checkbox" id="dcBackup" checked> Download a backup file</label>`,
      actions: [{ label: 'Cancel' }, { label: existing ? 'Update & finish' : 'Close day', cls: 'primary', onClick: async (m) => {
        const openingCash = U.n(U.$('#dcOpen', m.el).value);
        const counted = U.$('#dcCount', m.el).value === '' ? null : U.n(U.$('#dcCount', m.el).value);
        const expectedCash = openingCash + r.cashSales - r.cashExpenses;
        const rec = {
          id: day, at: new Date().toISOString(), openingCash, countedCash: counted, expectedCash,
          difference: counted === null ? null : counted - expectedCash, note: U.$('#dcNote', m.el).value.trim(),
          totals: { orders: r.orders, cups: r.cups, collected: r.collected, cogs: r.cogs, cashSales: r.cashSales, cashExpenses: r.cashExpenses },
        };
        await DB.put('dayCloses', rec);
        const doPrint = U.$('#dcPrint', m.el).checked;
        const doBackup = U.$('#dcBackup', m.el).checked;
        m.close();
        U.toast('Day closed. Great work today! 💙');
        if (doBackup) await App.backupNow();
        if (doPrint) await Print.dayReport({ ...r, title: 'End of day (Z) report', range: U.fmtDay(day), ...rec });
        load();
        return true;
      } }],
    });
    const box = U.$('#dcBox', md.el);
    const upd = () => {
      const open = U.n(U.$('#dcOpen', md.el).value);
      const exp = open + r.cashSales - r.cashExpenses;
      const cRaw = U.$('#dcCount', md.el).value;
      const diff = cRaw === '' ? null : U.n(cRaw) - exp;
      box.innerHTML = `
        <div class="tot-row"><span>Opening cash</span><span>${U.money(open)}</span></div>
        <div class="tot-row"><span>+ Cash sales</span><span>${U.money(r.cashSales)}</span></div>
        <div class="tot-row"><span>− Cash paid out (expenses / stock)</span><span>${U.money(r.cashExpenses)}</span></div>
        <div class="tot-row grand"><span>Expected in drawer</span><span>${U.money(exp)}</span></div>
        ${diff === null ? '' : `<div class="tot-row ${Math.abs(diff) < 1 ? 'good-text' : 'err'}"><span>${Math.abs(diff) < 1 ? '✓ Drawer matches' : diff > 0 ? 'Extra cash' : 'Cash short'}</span><span>${U.money(diff)}</span></div>`}
        <div class="tot-row muted"><span>bKash / Nagad / Card (check in apps)</span><span>${U.money(r.collected - r.cashSales)}</span></div>`;
    };
    U.$('#dcOpen', md.el).oninput = upd;
    U.$('#dcCount', md.el).oninput = upd;
    upd();
  }

  return { render, summarize };
})();
