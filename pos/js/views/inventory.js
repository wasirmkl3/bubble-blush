'use strict';
/* Inventory: stock levels, purchases, waste, stock counts, shopping list, history. */
Views.inventory = (() => {
  let root = null;
  let tab = 'stock';
  let filter = '';
  let hist = { from: null, to: null, type: '' };

  const TYPES = { purchase: 'Purchase', sale: 'Used in sale', void: 'Returned (void)', waste: 'Waste', adjust: 'Correction', count: 'Stock count' };

  function packs(ing, qty) {
    const p = U.n(ing.packSize);
    if (!p || p === 1) return '';
    return `≈ ${U.qty(qty / p)} × ${U.esc(ing.packLabel || 'pack')}`;
  }

  function render(el) {
    root = el;
    el.innerHTML = `
      <div class="page-head"><h1>Inventory</h1>
        <div class="tools">
          <input type="search" class="search" id="invSearch" placeholder="Search ingredient…" value="${U.esc(filter)}">
          <button class="btn ghost" id="invShop">🛒 Shopping list</button>
          <button class="btn ghost" id="invCount">📝 Stock count</button>
          <button class="btn primary" id="invAdd">+ New ingredient</button>
        </div></div>
      <div class="tabs" id="invTabs">${[['stock', 'Stock'], ['history', 'History']].map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div id="invBody"></div>`;
    U.$('#invTabs', el).onclick = (e) => {
      const b = e.target.closest('[data-t]');
      if (!b) return;
      tab = b.dataset.t;
      U.$$('#invTabs button', el).forEach((x) => x.classList.toggle('on', x === b));
      draw();
    };
    U.$('#invSearch', el).oninput = (e) => { filter = e.target.value; if (tab === 'stock') draw(); };
    U.$('#invAdd', el).onclick = () => editIng(null);
    U.$('#invCount', el).onclick = stockCount;
    U.$('#invShop', el).onclick = shoppingList;
    draw();
  }

  function draw() { (tab === 'stock' ? drawStock : drawHistory)(U.$('#invBody', root)); }

  function drawStock(body) {
    const all = Store.S.ingredients;
    const f = filter.trim().toLowerCase();
    const list = all.filter((i) => !f || i.name.toLowerCase().includes(f));
    const value = U.sum(all, (i) => Math.max(0, U.n(i.stock)) * U.n(i.costPerUnit));
    const low = all.filter((i) => Store.stockStatus(i) === 'low').length;
    const out = all.filter((i) => Store.stockStatus(i) === 'out').length;
    body.innerHTML = `
      <div class="stat-row">
        <div class="stat"><span>Stock value</span><b>${U.money(value)}</b></div>
        <div class="stat"><span>Ingredients</span><b>${all.length}</b></div>
        <div class="stat ${low ? 'warn' : ''}"><span>Running low</span><b>${low}</b></div>
        <div class="stat ${out ? 'bad' : ''}"><span>Out of stock</span><b>${out}</b></div>
      </div>
      <div class="card flush"><table class="tbl"><thead><tr><th>Ingredient</th><th class="r">In stock</th><th class="r">Alert at</th><th class="r">Cost / unit</th><th class="r">Value</th><th>Status</th><th></th></tr></thead>
      <tbody>${list.map((i) => {
        const s = Store.stockStatus(i);
        return `<tr data-id="${i.id}">
          <td><b>${U.esc(i.name)}</b>${i.packLabel ? `<br><small class="muted">Bought as ${U.esc(i.packLabel)}${U.n(i.packSize) > 1 ? ` (${U.qty(i.packSize)} ${U.esc(i.unit)})` : ''}</small>` : ''}</td>
          <td class="r"><b>${U.qty(i.stock)}</b> ${U.esc(i.unit)}<br><small class="muted">${packs(i, i.stock)}</small></td>
          <td class="r">${U.qty(i.lowAt)} ${U.esc(i.unit)}</td>
          <td class="r">${U.money(i.costPerUnit, U.n(i.costPerUnit) < 1 ? 2 : 1)}</td>
          <td class="r">${U.money(Math.max(0, U.n(i.stock)) * U.n(i.costPerUnit))}</td>
          <td><span class="badge ${s}">${{ ok: 'OK', low: 'Low', out: 'Out' }[s]}</span></td>
          <td class="r nowrap"><button class="btn sm primary" data-buy="${i.id}">+ Buy</button>
            <button class="btn sm ghost" data-waste="${i.id}">− Waste</button>
            <button class="btn sm ghost" data-edit="${i.id}">Edit</button></td></tr>`;
      }).join('') || '<tr><td class="empty">No ingredients</td></tr>'}</tbody></table></div>`;
    body.onclick = (e) => {
      const b = e.target.closest('[data-buy],[data-waste],[data-edit]');
      if (!b) return;
      if (b.dataset.buy) buy(Store.S.ing[b.dataset.buy]);
      if (b.dataset.waste) waste(Store.S.ing[b.dataset.waste]);
      if (b.dataset.edit) editIng(Store.S.ing[b.dataset.edit]);
    };
  }

  function buy(ing) {
    const hasPack = U.n(ing.packSize) > 1;
    const md = U.modal({
      title: `Buy stock: ${ing.name}`,
      body: `<div class="form-grid">
        ${hasPack ? `<div><label>Number of packs (${U.esc(ing.packLabel)})</label><input type="number" id="bPacks" min="0" step="any" autofocus></div>` : ''}
        <div><label>Quantity (${U.esc(ing.unit)})</label><input type="number" id="bQty" min="0" step="any" ${hasPack ? '' : 'autofocus'}></div>
        <div><label>Total paid ৳</label><input type="number" id="bCost" min="0" step="any"></div>
        <div><label>Supplier / note</label><input type="text" id="bNote" placeholder="e.g. New Market, Khulna"></div>
        <div class="span2"><label class="check"><input type="checkbox" id="bDrawer"> Paid with cash from the shop drawer today</label></div>
        <div class="span2 cost-info" id="bInfo"></div></div>`,
      actions: [{ label: 'Cancel' }, { label: 'Add to stock', cls: 'primary', onClick: async (m) => {
        const qty = U.n(U.$('#bQty', m.el).value);
        const cost = U.n(U.$('#bCost', m.el).value);
        if (qty <= 0) { U.toast('Enter the quantity bought', 'err'); return false; }
        const note = U.$('#bNote', m.el).value.trim();
        await Store.stockIn(ing.id, qty, cost, note);
        if (U.$('#bDrawer', m.el).checked && cost > 0) {
          await DB.put('expenses', {
            id: U.uid(), dayKey: Store.businessDay(), at: new Date().toISOString(), category: 'Stock purchase', amount: cost,
            method: 'Cash', note: `${ing.name}: ${U.qty(qty)} ${ing.unit}${note ? ' · ' + note : ''}`, fromDrawer: true, isStock: true,
          });
        }
        U.toast(`${ing.name}: +${U.qty(qty)} ${ing.unit}`);
        draw(); App.banners();
        return true;
      } }],
    });
    const p = U.$('#bPacks', md.el); const q = U.$('#bQty', md.el); const c = U.$('#bCost', md.el);
    const info = () => {
      const qty = U.n(q.value); const cost = U.n(c.value);
      U.$('#bInfo', md.el).innerHTML = qty > 0 && cost > 0
        ? `This purchase: ${U.money(cost / qty, 2)} per ${U.esc(ing.unit)} (was ${U.money(ing.costPerUnit, 2)}). Stock after: ${U.qty(U.n(ing.stock) + qty)} ${U.esc(ing.unit)}.`
        : `Current stock: ${U.qty(ing.stock)} ${U.esc(ing.unit)}`;
    };
    if (p) p.oninput = () => { q.value = U.round(U.n(p.value) * U.n(ing.packSize), 3) || ''; info(); };
    q.oninput = info; c.oninput = info;
    info();
  }

  function waste(ing) {
    U.modal({
      title: `Remove stock: ${ing.name}`,
      body: `<div class="form-grid">
        <div><label>Quantity to remove (${U.esc(ing.unit)})</label><input type="number" id="wQty" min="0" step="any" autofocus></div>
        <div><label>Reason</label><select id="wType">
          <option value="waste|Spilled / mistake">Spilled / made wrong</option>
          <option value="waste|Expired">Expired / spoiled</option>
          <option value="waste|Staff drink">Staff drink</option>
          <option value="waste|Free sample">Free sample / tasting</option>
          <option value="adjust|Correction">Correction (stock was wrong)</option></select></div>
        <div class="span2"><label>Note</label><input type="text" id="wNote"></div></div>`,
      actions: [{ label: 'Cancel' }, { label: 'Remove from stock', cls: 'danger solid', onClick: async (m) => {
        const qty = U.n(U.$('#wQty', m.el).value);
        if (qty <= 0) { U.toast('Enter a quantity', 'err'); return false; }
        const [type, reason] = U.$('#wType', m.el).value.split('|');
        const note = [reason, U.$('#wNote', m.el).value.trim()].filter(Boolean).join(' · ');
        await Store.adjustStock(ing.id, -qty, type, note);
        U.toast(`${ing.name}: −${U.qty(qty)} ${ing.unit}`);
        draw(); App.banners();
        return true;
      } }],
    });
  }

  function editIng(ing) {
    const isNew = !ing;
    const it = ing ? { ...ing } : { id: U.uid(), name: '', unit: 'g', costPerUnit: 0, stock: 0, lowAt: 0, packSize: 1000, packLabel: '1 kg pack', active: true };
    const md = U.modal({
      title: isNew ? 'New ingredient' : `Edit: ${it.name}`,
      wide: true,
      body: `<div class="form-grid">
        <div class="span2"><label>Name</label><input type="text" id="eName" value="${U.esc(it.name)}" autofocus></div>
        <div><label>Unit used in recipes</label><select id="eUnit">${['g', 'ml', 'pcs'].concat(['g', 'ml', 'pcs'].includes(it.unit) ? [] : [it.unit])
          .map((u) => `<option ${u === it.unit ? 'selected' : ''}>${U.esc(u)}</option>`).join('')}</select></div>
        <div><label>Low-stock alert at</label><input type="number" id="eLow" min="0" step="any" value="${it.lowAt}"></div>
        <div><label>Bought as (pack name)</label><input type="text" id="ePackL" value="${U.esc(it.packLabel || '')}" placeholder="1 kg pack, 1 L bottle…"></div>
        <div><label>Pack size (in unit)</label><input type="number" id="ePackS" min="0" step="any" value="${it.packSize || ''}"></div>
        <div><label>Price per pack ৳</label><input type="number" id="ePackP" min="0" step="any" value="${U.round(U.n(it.costPerUnit) * (U.n(it.packSize) || 1), 2)}"></div>
        <div><label>= Cost per unit ৳</label><input type="number" id="eCost" min="0" step="any" value="${it.costPerUnit}"></div>
        ${isNew ? `<div><label>Opening stock</label><input type="number" id="eStock" min="0" step="any" value="0"></div>` : ''}
      </div><p class="muted small mt">Cost per unit is updated automatically (weighted average) every time you record a purchase.</p>`,
      actions: [
        ...(!isNew ? [{ label: 'Delete', cls: 'danger', left: true, onClick: async () => {
          const used = Store.S.items.some((i) => i.sizes.some((s) => s.recipe.some((r) => r.ingId === it.id))) ||
            Store.S.toppings.some((t) => t.recipe.some((r) => r.ingId === it.id) || (t.flavours || []).some((f) => (f.recipe || []).some((r) => r.ingId === it.id))) ||
            Store.settings.sizes.some((s) => (s.packaging || []).some((r) => r.ingId === it.id));
          if (used) { U.toast('This ingredient is used in a recipe — remove it from recipes first', 'err', 4000); return false; }
          if (!(await U.confirm(`Delete <b>${U.esc(it.name)}</b>?`, { ok: 'Delete', danger: true }))) return false;
          await Store.remove('ingredients', it.id); draw(); return true;
        } }] : []),
        { label: 'Cancel' },
        { label: 'Save', cls: 'primary', onClick: async (m) => {
          it.name = U.$('#eName', m.el).value.trim();
          if (!it.name) { U.toast('Enter a name', 'err'); return false; }
          it.unit = U.$('#eUnit', m.el).value;
          it.lowAt = U.n(U.$('#eLow', m.el).value);
          it.packLabel = U.$('#ePackL', m.el).value.trim();
          it.packSize = U.n(U.$('#ePackS', m.el).value) || 1;
          it.costPerUnit = U.n(U.$('#eCost', m.el).value);
          await Store.save('ingredients', it);
          const opening = isNew ? U.n(U.$('#eStock', m.el).value) : 0;
          if (opening > 0) await Store.adjustStock(it.id, opening, 'adjust', 'Opening stock');
          draw(); return true;
        } },
      ],
    });
    const ps = U.$('#ePackS', md.el); const pp = U.$('#ePackP', md.el); const pc = U.$('#eCost', md.el);
    const fromPack = () => { const s = U.n(ps.value) || 1; pc.value = U.round(U.n(pp.value) / s, 4); };
    pp.oninput = fromPack; ps.oninput = fromPack;
    pc.oninput = () => { pp.value = U.round(U.n(pc.value) * (U.n(ps.value) || 1), 2); };
  }

  function stockCount() {
    const list = Store.S.ingredients;
    U.modal({
      title: '📝 Stock count',
      wide: true,
      body: `<p class="muted">Count what is physically in the shop and type it in. Leave blank to keep the current number. Differences are saved as “Stock count” in history.</p>
        <table class="tbl compact"><thead><tr><th>Ingredient</th><th class="r">System says</th><th>Actual count</th></tr></thead>
        <tbody>${list.map((i) => `<tr><td>${U.esc(i.name)}</td><td class="r">${U.qty(i.stock)} ${U.esc(i.unit)}</td>
          <td><input type="number" min="0" step="any" data-ing="${i.id}" style="width:110px"> ${U.esc(i.unit)}</td></tr>`).join('')}</tbody></table>`,
      actions: [{ label: 'Cancel' }, { label: 'Save count', cls: 'primary', onClick: async (m) => {
        const counts = {};
        U.$$('[data-ing]', m.el).forEach((inp) => { if (inp.value !== '') counts[inp.dataset.ing] = U.n(inp.value); });
        const n = await Store.stockCount(counts);
        U.toast(n ? `Updated ${n} ingredient${n > 1 ? 's' : ''}` : 'No changes');
        draw(); App.banners();
        return true;
      } }],
    });
  }

  function shoppingList() {
    const low = Store.lowStock();
    const rows = low.map((i) => {
      const want = Math.max(U.n(i.lowAt) * 3 - U.n(i.stock), U.n(i.lowAt));
      const p = U.n(i.packSize) || 1;
      const nPacks = Math.max(1, Math.ceil(want / p));
      return { i, nPacks, text: p > 1 ? `${nPacks} × ${i.packLabel || 'pack'}` : `${U.qty(Math.ceil(want))} ${i.unit}`, est: nPacks * p * U.n(i.costPerUnit) };
    });
    const text = `🛒 ${Store.settings.shopName} shopping list (${U.fmtDay(U.dayKey())})\n` + rows.map((r) => `• ${r.i.name}: ${r.text}`).join('\n');
    U.modal({
      title: '🛒 Shopping list',
      wide: true,
      body: rows.length ? `<p class="muted">Items at or below their alert level. Suggested amount brings stock to about 3× the alert level.</p>
        <table class="tbl compact"><thead><tr><th>Ingredient</th><th class="r">In stock</th><th>Buy</th><th class="r">Est. cost</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td>${U.esc(r.i.name)}</td><td class="r">${U.qty(r.i.stock)} ${U.esc(r.i.unit)}</td><td><b>${U.esc(r.text)}</b></td><td class="r">${U.money(r.est)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="3"><b>Total estimate</b></td><td class="r"><b>${U.money(U.sum(rows, (r) => r.est))}</b></td></tr></tfoot></table>`
        : '<p>🎉 Everything is above its alert level.</p>',
      actions: rows.length ? [{ label: 'Close' }, { label: '📋 Copy for WhatsApp', cls: 'primary', onClick: async () => {
        try { await navigator.clipboard.writeText(text); U.toast('Copied — paste it in WhatsApp/Messenger'); } catch { U.toast('Could not copy', 'err'); }
        return false;
      } }] : [{ label: 'Close' }],
    });
  }

  async function drawHistory(body) {
    hist.to = hist.to || Store.businessDay();
    hist.from = hist.from || U.addDays(hist.to, -6);
    body.innerHTML = `<div class="tools mb">
        <label class="inline">From <input type="date" id="hFrom" value="${hist.from}"></label>
        <label class="inline">To <input type="date" id="hTo" value="${hist.to}"></label>
        <select id="hType"><option value="">All types</option>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${hist.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <button class="btn ghost" id="hCsv">⬇ CSV</button></div><div id="hList" class="card flush"><p class="empty">Loading…</p></div>`;
    const reload = () => { hist.from = U.$('#hFrom', body).value; hist.to = U.$('#hTo', body).value; hist.type = U.$('#hType', body).value; drawHistory(body); };
    U.$('#hFrom', body).onchange = reload; U.$('#hTo', body).onchange = reload; U.$('#hType', body).onchange = reload;
    let moves = await Store.movesBetween(hist.from, hist.to);
    if (hist.type) moves = moves.filter((m) => m.type === hist.type);
    moves.sort((a, b) => b.at.localeCompare(a.at));
    const name = (id) => Store.S.ing[id]?.name || '(deleted)';
    const unit = (id) => Store.S.ing[id]?.unit || '';
    U.$('#hCsv', body).onclick = () => U.download(`stock-history-${hist.from}_to_${hist.to}.csv`, U.toCSV([
      ['Date', 'Time', 'Ingredient', 'Type', 'Qty', 'Unit', 'Value (BDT)', 'Note'],
      ...moves.map((m) => [m.dayKey, U.fmtTime(m.at), name(m.ingId), TYPES[m.type] || m.type, m.qty, unit(m.ingId), U.round(m.value), m.note || '']),
    ]), 'text/csv');
    const shown = moves.slice(0, 500);
    U.$('#hList', body).innerHTML = moves.length ? `<table class="tbl compact"><thead><tr><th>When</th><th>Ingredient</th><th>Type</th><th class="r">Qty</th><th class="r">Value</th><th>Note</th></tr></thead>
      <tbody>${shown.map((m) => `<tr><td class="nowrap">${U.fmtDateTime(m.at)}</td><td>${U.esc(name(m.ingId))}</td><td>${TYPES[m.type] || m.type}</td>
        <td class="r ${m.qty < 0 ? 'neg' : 'pos'}">${m.qty > 0 ? '+' : ''}${U.qty(m.qty)} ${U.esc(unit(m.ingId))}</td><td class="r">${U.money(m.value)}</td><td>${U.esc(m.note || '')}</td></tr>`).join('')}</tbody></table>
      ${moves.length > shown.length ? `<p class="muted small" style="padding:8px 12px">Showing latest 500 of ${moves.length}. Download CSV for all.</p>` : ''}`
      : '<p class="empty">No stock movements in this period.</p>';
  }

  return { render };
})();
