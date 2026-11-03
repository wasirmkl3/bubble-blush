'use strict';
/* Orders: browse a day's orders, reprint, mark ready, void. */
Views.orders = (() => {
  let root = null;
  let day = null;
  let q = '';
  let orders = [];

  async function render(el) {
    root = el;
    day = day || Store.businessDay();
    el.innerHTML = `
      <div class="page-head">
        <h1>Orders</h1>
        <div class="tools">
          <button class="btn ghost" id="oPrev">◀</button>
          <input type="date" id="oDay" value="${day}">
          <button class="btn ghost" id="oNext">▶</button>
          <button class="btn ghost" id="oToday">Today</button>
          <input type="search" id="oSearch" class="search" placeholder="Order #, name, phone, drink…" value="${U.esc(q)}">
        </div>
      </div>
      <div class="stat-row" id="oStats"></div>
      <div class="card flush"><table class="tbl" id="oTable"></table></div>`;
    U.$('#oDay', el).onchange = (e) => { day = e.target.value || Store.businessDay(); load(); };
    U.$('#oPrev', el).onclick = () => { day = U.addDays(day, -1); U.$('#oDay', el).value = day; load(); };
    U.$('#oNext', el).onclick = () => { day = U.addDays(day, 1); U.$('#oDay', el).value = day; load(); };
    U.$('#oToday', el).onclick = () => { day = Store.businessDay(); U.$('#oDay', el).value = day; load(); };
    U.$('#oSearch', el).oninput = (e) => { q = e.target.value; draw(); };
    await load();
  }

  async function load() {
    orders = (await DB.byIndex('orders', 'dayKey', day)).sort((a, b) => b.no - a.no);
    draw();
  }

  function draw() {
    const live = orders.filter((o) => o.status !== 'void');
    const paid = live.filter((o) => o.status !== 'unpaid');
    const unpaid = live.filter((o) => o.status === 'unpaid');
    U.$('#oStats', root).innerHTML = [
      ['Orders', live.length],
      ['Cups', U.sum(live, (o) => o.cups)],
      ['Sales', U.money(U.sum(paid, (o) => o.total))],
      ...(unpaid.length ? [['Not paid yet', `${unpaid.length} · ${U.money(U.sum(unpaid, (o) => o.total))}`]] : []),
      ['Voided', orders.length - live.length],
    ].map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('');
    const s = q.trim().toLowerCase();
    const list = orders.filter((o) => !s || String(o.no) === s.replace('#', '') ||
      (o.customerName || '').toLowerCase().includes(s) || (o.customerPhone || '').includes(s) ||
      o.lines.some((l) => l.name.toLowerCase().includes(s)));
    const tbl = U.$('#oTable', root);
    if (!list.length) { tbl.innerHTML = `<tr><td class="empty">No orders${orders.length ? ' match your search' : ' on ' + U.fmtDay(day)}.</td></tr>`; return; }
    tbl.innerHTML = `<thead><tr><th>#</th><th>Time</th><th>Drinks</th><th>Type</th><th>Customer</th><th>Payment</th><th class="r">Total</th><th>Status</th></tr></thead>
      <tbody>${list.map((o) => `<tr data-id="${o.id}" class="click ${o.status === 'void' ? 'void' : ''}">
        <td><b>#${o.no}</b>${o.moved ? ` <span title="Entered on ${U.esc(U.fmtDay(o.moved[0].fromDay))}, moved here">📅</span>` : ''}</td>
        <td>${U.fmtTime(o.at)}</td>
        <td class="wrap">${o.lines.map((l) => `${l.qty}× ${U.esc(l.name)}${l.sizeName ? ` <small>(${U.esc(l.sizeName)})</small>` : ''}${l.parcel ? ' 🥡' : ''}`).join(', ')}</td>
        <td>${U.esc(o.orderType)}</td>
        <td>${U.esc(o.customerName || '')}${o.customerPhone ? `<br><small>${U.esc(o.customerPhone)}</small>` : ''}</td>
        <td>${o.status === 'unpaid' ? '<span class="badge out">Not paid</span>' : U.esc(o.payMethod)}</td>
        <td class="r"><b>${U.money(o.total)}</b>${o.discount ? `<br><small class="muted">-${U.money(o.discount)} disc.</small>` : ''}${o.comp ? `<br><small class="muted">🎁 -${U.money(o.comp)}</small>` : ''}</td>
        <td>${o.status === 'void' ? '<span class="badge out">Void</span>' : o.ready ? '<span class="badge ok">Served</span>' : '<span class="badge low">Making</span>'}</td>
      </tr>`).join('')}</tbody>`;
    tbl.onclick = (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (tr) openOrder(orders.find((o) => o.id === tr.dataset.id));
    };
  }

  function openOrder(o) {
    const lines = o.lines.map((l, i) => `<tr>
      <td>${l.qty}×</td>
      <td><b>${U.esc(l.name)}</b>${l.sizeName ? ` (${U.esc(l.sizeName)})` : ' <span class="tag">no drink</span>'}${l.parcel ? ' <span class="tag parcel">🥡 Parcel</span>' : ''}${l.compDrink ? ' <b class="comp-tag">🎁 COMPLIMENTARY</b>' : ''}
        <div class="muted small">${[l.sugar && 'Sugar ' + l.sugar, l.ice].filter(Boolean).map(U.esc).join(' · ')}
        ${(l.included || []).length ? '<br>Included: ' + l.included.map(U.esc).join(', ') : ''}
        ${l.toppings.length ? '<br>' + l.toppings.map((t, k) => `+ ${U.esc(Store.topName(t))} ${U.money(t.price * Store.topQty(t))}${t.comp && !l.compDrink ? ' <b class="comp-tag">🎁 COMPLIMENTARY</b>' : ''}${l.promo && k === l.promoIndex ? ' <b class="free-tag">FREE</b>' : ''}`).join('<br>') : ''}${l.note ? '<br>✎ ' + U.esc(l.note) : ''}</div></td>
      <td class="r">${U.money(l.lineTotal)}</td>
      <td><button class="btn sm ghost" data-sticker="${i}" ${Store.isToppingLine(l) ? 'hidden' : ''} title="Reprint stickers for this drink">🏷</button></td></tr>`).join('');
    const margin = o.total ? (o.total - o.cost) / o.total : 0;
    const md = U.modal({
      title: `Order #${o.no} · ${U.fmtDateTime(o.at)}`,
      wide: true,
      body: `
        ${o.status === 'void' ? `<div class="banner low">Voided ${U.fmtDateTime(o.voidAt)}${o.voidReason ? ' — ' + U.esc(o.voidReason) : ''}${o.restocked ? ' (stock returned)' : ''}</div>` : ''}
        ${(o.moved || []).map((mv) => `<div class="banner info">📅 Entered on ${U.fmtDay(mv.fromDay)} as #${mv.fromNo} (${U.fmtTime(mv.fromAt)}), moved to ${U.fmtDay(mv.toDay)} on ${U.fmtDateTime(mv.movedAt)}.</div>`).join('')}
        ${o.status === 'unpaid' ? '<div class="banner warn">💰 Not paid yet: the kitchen copy went first. Press <b>Take payment</b> when the customer pays.</div>' : ''}
        <div class="kv"><span>Type</span><b>${U.esc(o.orderType)}</b><span>Payment</span><b>${o.status === 'unpaid' ? 'Not paid yet' : U.esc(o.payMethod)}</b>
          ${o.customerName || o.customerPhone ? `<span>Customer</span><b>${U.esc(o.customerName)} ${U.esc(o.customerPhone)}</b>` : ''}
          ${o.note ? `<span>Note</span><b>${U.esc(o.note)}</b>` : ''}</div>
        <table class="tbl compact">${lines}</table>
        <div class="tot-box">
          <div class="tot-row"><span>Subtotal</span><span>${U.money(o.subtotal)}</span></div>
          ${o.comp ? `<div class="tot-row disc"><span>🎁 Complimentary${o.compReason ? ' · ' + U.esc(o.compReason) : ''}</span><span>-${U.money(o.comp)}</span></div>` : ''}
          ${o.promo ? `<div class="tot-row disc"><span>🎁 ${U.esc(o.promoName || 'Promotion')}</span><span>-${U.money(o.promo)}</span></div>` : ''}
          ${o.discount ? `<div class="tot-row disc"><span>Discount ${o.discountInfo?.reason ? '· ' + U.esc(o.discountInfo.reason) : ''}</span><span>-${U.money(o.discount)}</span></div>` : ''}
          ${o.vat ? `<div class="tot-row"><span>VAT</span><span>${U.money(o.vat)}</span></div>` : ''}
          ${o.deliveryCharge ? `<div class="tot-row"><span>Delivery charge</span><span>${U.money(o.deliveryCharge)}</span></div>` : ''}
          ${o.packagingCharge ? `<div class="tot-row"><span>Packaging</span><span>${U.money(o.packagingCharge)}</span></div>` : ''}
          <div class="tot-row grand"><span>Total</span><span>${U.money(o.total)}</span></div>
          ${o.status !== 'unpaid' && o.payMethod === 'Cash' ? `<div class="tot-row muted"><span>Received / change</span><span>${U.money(o.received)} / ${U.money(o.change)}</span></div>` : ''}
          <div class="tot-row muted"><span>Ingredient cost (est.)</span><span>${U.money(o.cost)} · margin ${U.pct(margin)}</span></div>
          ${o.comp ? `<div class="tot-row muted"><span>&nbsp;&nbsp;of which complimentary</span><span>${U.money(Store.orderCompCost(o))}</span></div>` : ''}
        </div>`,
      actions: [
        ...(o.status !== 'void' ? [{ label: 'Void order', cls: 'danger', left: true, onClick: () => voidFlow(o) }] : []),
        ...(o.status === 'paid' ? [{ label: '📅 Move to another day', left: true, onClick: (dm) => { moveFlow(o, dm); return false; } }] : []),
        ...(o.status !== 'void' ? [{ label: o.ready ? 'Mark making' : 'Mark served', onClick: async () => { await Store.setReady(o, !o.ready); draw(); } }] : []),
        ...(Store.settings.stickersEnabled ? [{ label: '🏷 All stickers', onClick: () => { Print.stickers(o); return false; } }] : []),
        { label: '👩‍🍳 Kitchen copy', onClick: async () => { const r = await Print.kitchen(o, { reprint: !!o.kitchenAt }); if (r && r.ok) await Store.markKitchenPrinted(o); return false; } },
        ...(o.status === 'unpaid'
          ? [{ label: '💰 Take payment', cls: 'primary', onClick: () => { Views.pos.takePayment(o, () => draw()); } }]
          : [{ label: '🧾 Reprint bill', cls: 'primary', onClick: () => { Print.receipt(o, { reprint: true }); return false; } }]),
      ],
    });
    md.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sticker]');
      if (b) Print.stickers(o, Number(b.dataset.sticker));
    });
  }

  /* Forgot to enter an order (e.g. a complimentary drink for a relative) on its day?
     Enter it today as usual, then move it here to the day it really happened. */
  async function moveFlow(o, detail) {
    if (!(await App.requirePin('Moving an order to another day needs the manager PIN.'))) return;
    const today = Store.businessDay();
    let to = o.dayKey === U.addDays(today, -1) ? U.addDays(today, -2) : U.addDays(today, -1);
    if (to === o.dayKey) to = U.addDays(o.dayKey, -1);
    const closes = await DB.all('dayCloses');
    const chips = [[U.addDays(today, -1), 'Yesterday'], [U.addDays(today, -2), '2 days ago'], [U.addDays(today, -3), '3 days ago'], [today, 'Today']]
      .filter(([d]) => d !== o.dayKey);
    const cash = o.payMethod === 'Cash' && o.total > 0;
    const md = U.modal({
      title: `📅 Move order #${o.no} to another day`,
      body: `<p>The order moves with its sales, complimentary cost and stock use. It gets the next order number on that day and keeps its time (${U.fmtTime(o.at)}).</p>
        <div class="opt-group"><label>Move to</label><input type="date" id="mvDay" value="${to}" max="${today}">
          <div class="chips mt">${chips.map(([d, l]) => `<button type="button" class="chip" data-d="${d}">${l}</button>`).join('')}</div>
          <p class="muted small mt" id="mvLabel"></p></div>
        <div id="mvWarn"></div>`,
      actions: [{ label: 'Cancel' }, { label: 'Move order', cls: 'primary', onClick: async (m) => {
        const d = U.$('#mvDay', m.el).value;
        const fromNo = o.no; const fromDay = o.dayKey;
        try { await Store.moveOrderDay(o, d); } catch (err) { U.toast(err.message || String(err), 'err'); return false; }
        U.toast(`Order #${fromNo} (${U.fmtDay(fromDay)}) moved to ${U.fmtDay(d)} as #${o.no}`, 'ok', 5000);
        detail?.close();
        load();
        return true;
      } }],
    });
    const inp = U.$('#mvDay', md.el);
    const upd = () => {
      const d = inp.value;
      const ok = d && d <= today && d !== o.dayKey;
      md.el.querySelector('.modal-actions .primary').disabled = !ok;
      U.$('#mvLabel', md.el).textContent = !d ? '' : d > today ? 'That day is in the future.' : d === o.dayKey ? 'The order is already on this day.' : U.fmtDay(d);
      U.$$('[data-d]', md.el).forEach((b) => b.classList.toggle('on', b.dataset.d === d));
      const closed = closes.filter((c) => c.id === d || c.id === o.dayKey);
      U.$('#mvWarn', md.el).innerHTML = [
        ...closed.map((c) => `<div class="banner warn">🔒 ${U.fmtDay(c.id)} was already closed. After moving, open Reports for that day, press <b>✓ Day closed — view</b> and <b>Update &amp; finish</b> to save and reprint the new totals.</div>`),
        cash ? `<div class="banner low">💵 This order was paid in cash (${U.money(o.total)}). The money is in today's drawer, so moving it changes the expected cash for both days.</div>` : '',
      ].join('');
    };
    inp.addEventListener('input', upd);
    md.el.addEventListener('click', (e) => { const b = e.target.closest('[data-d]'); if (b) { inp.value = b.dataset.d; upd(); } });
    upd();
  }

  async function voidFlow(o) {
    if (!(await App.requirePin('Voiding an order needs the manager PIN.'))) return false;
    return new Promise((resolve) => {
      let done = false;
      U.modal({
        title: `Void order #${o.no}?`,
        body: `<p>Use this for mistakes or refunds. The order stays in history but is removed from sales.</p>
          <div class="opt-group"><label>Reason</label><input type="text" id="vReason" autofocus placeholder="Wrong drink, customer cancelled…"></div>
          <label class="check"><input type="checkbox" id="vRestock" checked> Put ingredients back in stock (drink was not made)</label>`,
        actions: [{ label: 'Keep order' }, {
          label: 'Void order', cls: 'danger solid', onClick: async (m) => {
            await Store.voidOrder(o, U.$('#vReason', m.el).value.trim(), U.$('#vRestock', m.el).checked);
            U.toast(`Order #${o.no} voided`);
            done = true;
            draw();
          },
        }],
        onClose: () => resolve(done ? true : false),
      });
    });
  }

  return { render };
})();
