'use strict';
/* Customers: who comes back, who spends the most, what they drink, loyalty card progress. */
Views.customers = (() => {
  let root = null;
  let all = [];          // every order (for loyalty, which always counts all history)
  let list = [];         // customers for the chosen period
  let period = 'all';
  let sort = 'spent';
  let q = '';

  const PERIODS = [['all', 'All time'], ['month', 'This month'], ['30', 'Last 30 days'], ['90', 'Last 90 days']];
  const SORTS = [['spent', 'Most spent'], ['visits', 'Most visits'], ['cups', 'Most cups'], ['last', 'Last visit'], ['new', 'Newest']];

  function periodStart() {
    const today = Store.businessDay();
    if (period === 'month') return today.slice(0, 8) + '01';
    if (period === '30') return U.addDays(today, -29);
    if (period === '90') return U.addDays(today, -89);
    return '0000-00-00';
  }

  const keyOf = (o) => {
    const phone = (o.customerPhone || '').replace(/\s+/g, '');
    const name = (o.customerName || '').trim();
    return phone ? 'p:' + phone : name ? 'n:' + name.toLowerCase() : '';
  };

  /* Bangladesh mobile 01XXXXXXXXX → WhatsApp 8801XXXXXXXXX. */
  const waLink = (phone) => {
    const d = String(phone || '').replace(/\D/g, '');
    const intl = d.startsWith('880') ? d : d.startsWith('0') ? '88' + d : d;
    return intl.length >= 12 ? `https://wa.me/${intl}` : '';
  };

  function build() {
    const from = periodStart();
    const today = Store.businessDay();
    const { card } = Store.loyaltyCard();
    const map = new Map();
    // All paid orders, oldest first, so "first visit" and the latest name are right.
    const paid = all.filter((o) => o.status === 'paid' && keyOf(o)).sort((a, b) => a.at.localeCompare(b.at));
    paid.forEach((o) => {
      const k = keyOf(o);
      let c = map.get(k);
      if (!c) {
        c = { key: k, phone: (o.customerPhone || '').replace(/\s+/g, ''), name: '', first: o.dayKey, last: o.dayKey, lastAt: o.at,
          orders: [], allOrders: [], loyaltyDays: new Set(), days: new Set(), cups: 0, freeCups: 0, spent: 0, comp: 0, drinks: {}, tops: {} };
        map.set(k, c);
      }
      if ((o.customerName || '').trim()) c.name = o.customerName.trim();
      c.allOrders.push(o);
      c.last = o.dayKey; c.lastAt = o.at;
      if (Store.countsForLoyalty(o)) c.loyaltyDays.add(o.dayKey);
      if (o.dayKey < from) return;
      c.orders.push(o);
      c.days.add(o.dayKey);
      c.spent += U.n(o.total);
      c.comp += U.n(o.comp);
      (o.lines || []).forEach((l) => {
        (l.toppings || []).forEach((t) => { c.tops[t.name] = (c.tops[t.name] || 0) + l.qty * Store.topQty(t); });
        if (Store.isToppingLine(l)) return;
        c.cups += l.qty;
        if (Store.isFreeCup(l)) c.freeCups += l.qty;
        const d = c.drinks[l.name] = c.drinks[l.name] || { name: l.name, cups: 0, sizes: {} };
        d.cups += l.qty;
        if (l.sizeName) d.sizes[l.sizeName] = (d.sizes[l.sizeName] || 0) + l.qty;
      });
    });
    list = [...map.values()].filter((c) => c.orders.length).map((c) => {
      const drinks = Object.values(c.drinks).sort((a, b) => b.cups - a.cups);
      // Loyalty card position after all their visits so far (all time).
      const n = c.loyaltyDays.size;
      const pos = card && c.phone ? (n ? ((n - 1) % card) + 1 : 0) : null;
      let next = null;
      if (card && c.phone) for (let v = n + 1; v <= n + card && !next; v++) { const r = Store.rewardAt(v); if (r) next = { in: v - n, reward: r }; }
      return {
        ...c, visits: c.days.size, drinks, fav: drinks[0] || null,
        avg: c.orders.length ? c.spent / c.orders.length : 0,
        daysSince: Math.round((U.parseDay(today) - U.parseDay(c.last)) / 86400000),
        loyalty: pos === null ? null : { visits: n, pos, card, next },
      };
    });
  }

  function sorted() {
    const s = q.trim().toLowerCase();
    const digits = s.replace(/\D/g, '');
    const rows = list.filter((c) => !s || (c.name || '').toLowerCase().includes(s) || (digits.length >= 3 && c.phone.includes(digits)) ||
      c.drinks.some((d) => d.name.toLowerCase().includes(s)));
    const by = {
      spent: (a, b) => b.spent - a.spent || b.visits - a.visits,
      visits: (a, b) => b.visits - a.visits || b.spent - a.spent,
      cups: (a, b) => b.cups - a.cups || b.spent - a.spent,
      last: (a, b) => b.lastAt.localeCompare(a.lastAt),
      new: (a, b) => b.first.localeCompare(a.first) || b.lastAt.localeCompare(a.lastAt),
    };
    return rows.sort(by[sort]);
  }

  async function render(el) {
    root = el;
    el.innerHTML = `
      <div class="page-head"><h1>Customers</h1>
        <div class="tools">
          <div class="chips" id="cPeriod">${PERIODS.map(([k, l]) => `<button class="chip ${period === k ? 'on' : ''}" data-p="${k}">${l}</button>`).join('')}</div>
          <select id="cSort">${SORTS.map(([k, l]) => `<option value="${k}" ${sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <input type="search" id="cSearch" class="search" placeholder="Name, phone or drink…" value="${U.esc(q)}">
          <button class="btn ghost" id="cCsv">⬇ Customers CSV</button>
        </div></div>
      <div class="stat-row" id="cStats"></div>
      <div class="grid3 mb" id="cTop"></div>
      <div class="card flush"><table class="tbl" id="cTable"></table></div>`;
    U.$('#cPeriod', el).onclick = (e) => {
      const b = e.target.closest('[data-p]');
      if (!b) return;
      period = b.dataset.p;
      U.$$('#cPeriod .chip', el).forEach((x) => x.classList.toggle('on', x === b));
      build(); draw();
    };
    U.$('#cSort', el).onchange = (e) => { sort = e.target.value; draw(); };
    U.$('#cSearch', el).oninput = (e) => { q = e.target.value; drawTable(); };
    U.$('#cCsv', el).onclick = csv;
    all = await DB.all('orders');
    build();
    draw();
  }

  function draw() {
    const from = periodStart();
    const inPeriod = all.filter((o) => o.status === 'paid' && o.dayKey >= from);
    const known = inPeriod.filter((o) => keyOf(o));
    const sales = U.sum(inPeriod, (o) => o.total);
    const knownSales = U.sum(known, (o) => o.total);
    const fresh = list.filter((c) => c.first >= from).length;
    const returning = list.filter((c) => c.visits >= 2).length;
    U.$('#cStats', root).innerHTML = [
      ['Customers', list.length, `${list.filter((c) => c.phone).length} with phone`],
      ['New', period === 'all' ? '—' : fresh, period === 'all' ? '' : 'first visit in this period'],
      ['Returning', returning, list.length ? `${U.pct(returning / list.length)} came 2+ days` : ''],
      ['Avg spend', U.money(list.length ? U.sum(list, (c) => c.spent) / list.length : 0), 'per customer'],
      ['Sales from known customers', U.money(knownSales), sales ? `${U.pct(knownSales / sales)} of sales · ${inPeriod.length - known.length} orders had no name/phone` : ''],
    ].map(([k, v, sm]) => `<div class="stat"><span>${k}</span><b>${v}</b>${sm ? `<small>${sm}</small>` : ''}</div>`).join('');

    // Top 3 by money spent, plus who has a loyalty reward coming up next visit.
    const top = [...list].sort((a, b) => b.spent - a.spent).slice(0, 3);
    const soon = list.filter((c) => c.loyalty && c.loyalty.next && c.loyalty.next.in === 1).sort((a, b) => b.lastAt.localeCompare(a.lastAt));
    const medals = ['🥇', '🥈', '🥉'];
    U.$('#cTop', root).innerHTML = top.length ? `
      <div class="card"><h3>🏆 Top customers</h3>${top.map((c, i) => `<div class="tot-row click-row" data-key="${U.esc(c.key)}">
        <span>${medals[i]} <b>${U.esc(c.name || c.phone)}</b>${c.name && c.phone ? ` <small class="muted">${U.esc(c.phone)}</small>` : ''}<br>
        <small class="muted">${c.visits} visits · ${c.cups} cups${c.fav ? ` · loves ${U.esc(c.fav.name)}` : ''}</small></span><span><b>${U.money(c.spent)}</b></span></div>`).join('')}</div>
      <div class="card"><h3>🧋 Favourite drinks of regulars</h3>${(() => {
        const fav = {};
        list.filter((c) => c.visits >= 2 && c.fav).forEach((c) => { fav[c.fav.name] = (fav[c.fav.name] || 0) + 1; });
        const rows = Object.entries(fav).sort((a, b) => b[1] - a[1]).slice(0, 6);
        return rows.length ? rows.map(([n, k]) => `<div class="tot-row"><span>${U.esc(n)}</span><span>${k} regular${k === 1 ? '' : 's'}</span></div>`).join('')
          : '<p class="muted">No returning customers yet.</p>';
      })()}</div>
      <div class="card"><h3>🎫 Reward on next visit</h3>${soon.length ? soon.slice(0, 6).map((c) => `<div class="tot-row click-row" data-key="${U.esc(c.key)}">
        <span><b>${U.esc(c.name || c.phone)}</b> <small class="muted">${U.esc(c.phone)}</small></span>
        <span class="gold small">${U.esc(Store.rewardLabel(c.loyalty.next.reward))}</span></div>`).join('')
        : '<p class="muted">Nobody is one visit away from a reward.</p>'}</div>` : '';
    U.$('#cTop', root).onclick = (e) => { const r = e.target.closest('[data-key]'); if (r) openCustomer(r.dataset.key); };
    drawTable();
  }

  function drawTable() {
    const rows = sorted();
    const tbl = U.$('#cTable', root);
    if (!rows.length) {
      tbl.innerHTML = `<tr><td class="empty">${list.length ? 'No customers match your search.' : 'No customers yet. Ask for the phone number at every order to build this list.'}</td></tr>`;
      return;
    }
    tbl.innerHTML = `<thead><tr><th>#</th><th>Customer</th><th class="r">Visits</th><th class="r">Cups</th><th class="r">Spent</th><th class="r">Avg order</th><th>Favourite drink</th><th>Last visit</th><th>Loyalty card</th></tr></thead>
      <tbody>${rows.map((c, i) => `<tr class="click" data-key="${U.esc(c.key)}">
        <td>${i + 1}</td>
        <td><b>${U.esc(c.name || '—')}</b><br><small class="muted">${U.esc(c.phone || 'no phone')}</small></td>
        <td class="r">${c.visits}</td>
        <td class="r">${c.cups}${c.freeCups ? `<br><small class="muted">🎁 ${c.freeCups} free</small>` : ''}</td>
        <td class="r"><b>${U.money(c.spent)}</b></td>
        <td class="r">${U.money(c.avg)}</td>
        <td>${c.fav ? `${U.esc(c.fav.name)} <small class="muted">×${c.fav.cups}</small>` : '—'}</td>
        <td>${U.fmtDay(c.last)}<br><small class="muted">${c.daysSince === 0 ? 'today' : c.daysSince === 1 ? 'yesterday' : `${c.daysSince} days ago`}</small></td>
        <td>${c.loyalty ? `${c.loyalty.pos} of ${c.loyalty.card}${c.loyalty.next ? `<br><small class="muted">${c.loyalty.next.in === 1 ? '🎁 reward next visit' : `${c.loyalty.next.in} to ${c.loyalty.next.reward === 'topping' ? 'free topping' : 'free drink'}`}</small>` : ''}` : '<small class="muted">—</small>'}</td>
      </tr>`).join('')}</tbody>`;
    tbl.onclick = (e) => { const tr = e.target.closest('tr[data-key]'); if (tr) openCustomer(tr.dataset.key); };
  }

  function openCustomer(key) {
    const c = list.find((x) => x.key === key);
    if (!c) return;
    const tops = Object.entries(c.tops).sort((a, b) => b[1] - a[1]);
    const common = (field) => {
      const m = {};
      c.orders.forEach((o) => o.lines.forEach((l) => { if (l[field]) m[l[field]] = (m[l[field]] || 0) + l.qty; }));
      return Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    };
    const sugar = common('sugar'); const ice = common('ice');
    const wa = waLink(c.phone);
    const L = c.loyalty;
    const stamps = L ? `<span class="stamps">${Array.from({ length: L.card }, (_, i) => `<i class="${i < L.pos ? 'on' : ''} ${Store.rewardAt(i + 1) ? 'gift' : ''}">${Store.rewardAt(i + 1) ? '🎁' : ''}</i>`).join('')}</span>` : '';
    const rewards = c.allOrders.filter((o) => o.loyalty);
    const history = [...c.orders].reverse();
    U.modal({
      title: `👤 ${c.name || c.phone}`,
      wide: true,
      body: `
        <div class="kv">
          <span>Phone</span><b>${U.esc(c.phone || '—')}${wa ? ` <a class="btn sm ghost" href="${wa}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}</b>
          <span>First visit</span><b>${U.fmtDay(c.first)}</b>
          <span>Last visit</span><b>${U.fmtDay(c.last)} (${c.daysSince === 0 ? 'today' : `${c.daysSince} days ago`})</b>
          <span>${period === 'all' ? 'All time' : PERIODS.find((p) => p[0] === period)[1]}</span><b>${c.visits} visits · ${c.orders.length} orders · ${c.cups} cups · ${U.money(c.spent)} spent · avg ${U.money(c.avg)}</b>
          ${c.comp ? `<span>Given free</span><b>${U.money(c.comp)} (complimentary &amp; loyalty)</b>` : ''}
          ${sugar || ice ? `<span>Usually</span><b>${[sugar && `Sugar ${sugar}`, ice].filter(Boolean).map(U.esc).join(' · ')}</b>` : ''}
          ${L ? `<span>Loyalty card</span><b>Visit ${L.pos} of ${L.card} ${stamps}${L.next ? `<br><small class="muted">${L.next.in} more visit${L.next.in === 1 ? '' : 's'}: ${U.esc(Store.rewardLabel(L.next.reward))}</small>` : ''}${rewards.length ? `<br><small class="muted">${rewards.length} reward${rewards.length === 1 ? '' : 's'} given so far</small>` : ''}</b>` : ''}
        </div>
        <div class="grid3 mt">
          <div class="card"><h3>🧋 Drinks ordered</h3>${c.drinks.length ? `<table class="tbl compact"><thead><tr><th>Drink</th><th class="r">Cups</th></tr></thead><tbody>
            ${c.drinks.map((d) => `<tr><td>${U.esc(d.name)}<br><small class="muted">${Object.entries(d.sizes).map(([s, n]) => `${U.esc(s)} ×${n}`).join(' · ')}</small></td><td class="r">${d.cups}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">—</p>'}</div>
          <div class="card"><h3>✨ Toppings</h3>${tops.length ? tops.map(([n, k]) => `<div class="tot-row"><span>${U.esc(n)}</span><span>${k}×</span></div>`).join('') : '<p class="muted">No toppings.</p>'}</div>
          <div class="card"><h3>🧾 Orders</h3><table class="tbl compact"><tbody>${history.slice(0, 30).map((o) => `<tr>
            <td><small class="muted">${U.fmtDay(o.dayKey)}</small><br>#${o.no} · ${U.fmtTime(o.at)}</td>
            <td class="wrap">${o.lines.map((l) => `${l.qty}× ${U.esc(l.name)}${l.sizeName ? ` (${U.esc(l.sizeName)})` : ''}`).join(', ')}${o.loyalty ? ' <b class="comp-tag">🎫</b>' : o.comp ? ' <b class="comp-tag">🎁</b>' : ''}</td>
            <td class="r">${U.money(o.total)}</td></tr>`).join('')}</tbody></table>
            ${history.length > 30 ? `<p class="muted small mt">Latest 30 of ${history.length} shown.</p>` : ''}</div>
        </div>`,
      actions: [{ label: 'Close', cls: 'primary' }],
    });
  }

  function csv() {
    const rows = sorted();
    U.download(`customers-${period}-${Store.businessDay()}.csv`, U.toCSV([
      ['Name', 'Phone', 'Visits (days)', 'Orders', 'Cups', 'Free cups', 'Spent (BDT)', 'Avg order (BDT)', 'Favourite drink', 'First visit', 'Last visit', 'Loyalty card', 'Next reward'],
      ...rows.map((c) => [c.name, c.phone, c.visits, c.orders.length, c.cups, c.freeCups, U.round(c.spent), U.round(c.avg), c.fav ? c.fav.name : '', c.first, c.last,
        c.loyalty ? `${c.loyalty.pos}/${c.loyalty.card}` : '', c.loyalty && c.loyalty.next ? `${c.loyalty.next.in} visit(s): ${Store.rewardLabel(c.loyalty.next.reward)}` : '']),
    ]), 'text/csv');
  }

  return { render };
})();
