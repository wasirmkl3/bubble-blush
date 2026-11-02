'use strict';
/* Menu & Pricing: drinks, toppings, categories, sizes/packaging, recipe costing. */
Views.menu = (() => {
  let root = null;
  let tab = 'drinks';

  const target = () => (U.n(Store.settings.targetFoodCost) || 30) / 100;
  function fcBadge(cost, price) {
    if (!price) return '<span class="badge">–</span>';
    const fc = cost / price;
    const cls = fc <= target() + 0.0001 ? 'ok' : fc <= target() + 0.08 ? 'low' : 'out';
    return `<span class="badge ${cls}" title="Ingredient + packaging cost as % of price">${U.pct(fc)}</span>`;
  }

  function render(el) {
    root = el;
    el.innerHTML = `
      <div class="page-head">
        <h1>Menu &amp; Pricing</h1>
        <div class="tools">
          <label class="inline">Target cost % <input type="number" id="mTarget" min="10" max="80" value="${U.n(Store.settings.targetFoodCost) || 30}" style="width:70px"></label>
          <button class="btn ghost" id="mPrint">🖨 Print menu card</button>
        </div>
      </div>
      <div class="tabs" id="mTabs">
        ${[['drinks', 'Drinks'], ['toppings', 'Toppings'], ['categories', 'Categories'], ['sizes', 'Sizes & packaging']]
          .map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}
      </div>
      <div id="mBody"></div>`;
    U.$('#mTabs', el).onclick = (e) => {
      const b = e.target.closest('[data-t]');
      if (!b) return;
      tab = b.dataset.t;
      U.$$('#mTabs button', el).forEach((x) => x.classList.toggle('on', x === b));
      draw();
    };
    U.$('#mTarget', el).onchange = async (e) => {
      await Store.saveSettings({ targetFoodCost: Math.max(10, Math.min(80, U.n(e.target.value) || 30)) });
      draw();
    };
    U.$('#mPrint', el).onclick = () => Print.menu();
    draw();
  }

  function draw() {
    const body = U.$('#mBody', root);
    ({ drinks: drawDrinks, toppings: drawToppings, categories: drawCategories, sizes: drawSizes })[tab](body);
  }

  /* ---------- recipe editor (shared) ---------- */
  function recipeEditor(container, recipe, onChange) {
    let rows = (recipe || []).map((r) => ({ ...r }));
    const ingOptions = (sel) => `<option value="">— choose ingredient —</option>` + Store.S.ingredients
      .map((i) => `<option value="${i.id}" ${i.id === sel ? 'selected' : ''}>${U.esc(i.name)} (${U.esc(i.unit)})</option>`).join('');
    function paint() {
      container.innerHTML = `<table class="tbl compact recipe">
        <thead><tr><th>Ingredient</th><th>Qty</th><th class="r">Cost</th><th></th></tr></thead>
        <tbody>${rows.map((r, i) => {
          const ing = Store.S.ing[r.ingId];
          return `<tr data-i="${i}">
            <td><select data-f="ingId">${ingOptions(r.ingId)}</select></td>
            <td><input type="number" step="any" min="0" data-f="qty" value="${r.qty}" style="width:80px"> <small>${U.esc(ing?.unit || '')}</small></td>
            <td class="r">${U.money(U.n(r.qty) * U.n(ing?.costPerUnit), 1)}</td>
            <td><button type="button" class="icon-btn" data-del="${i}">✕</button></td></tr>`;
        }).join('')}</tbody></table>
        <button type="button" class="btn sm ghost" data-add>+ Add ingredient</button>`;
    }
    container.addEventListener('change', (e) => {
      const tr = e.target.closest('tr[data-i]');
      if (!tr) return;
      const r = rows[Number(tr.dataset.i)];
      r[e.target.dataset.f] = e.target.dataset.f === 'qty' ? U.n(e.target.value) : e.target.value;
      paint(); onChange && onChange();
    });
    container.addEventListener('click', (e) => {
      if (e.target.closest('[data-add]')) { rows.push({ ingId: '', qty: 0 }); paint(); }
      const d = e.target.closest('[data-del]');
      if (d) { rows.splice(Number(d.dataset.del), 1); paint(); onChange && onChange(); }
    });
    paint();
    return {
      get: () => rows.filter((r) => r.ingId && U.n(r.qty) > 0).map((r) => ({ ingId: r.ingId, qty: U.n(r.qty) })),
      set: (rec) => { rows = rec.map((r) => ({ ...r })); paint(); onChange && onChange(); },
    };
  }

  /* ---------- drinks ---------- */
  function drawDrinks(body) {
    const sizes = Store.settings.sizes;
    body.innerHTML = `
      <div class="row-between mb"><p class="muted">Cost = ingredients + cup, lid, straw &amp; sticker. Green = at or under your target cost %. Tap a drink to edit its price and recipe.
          New drinks get a ✨ NEW badge and their own tab on the Sell screen; untick “New item” when it becomes a regular.</p>
        <button class="btn primary" id="addItem">+ New drink / item</button></div>
      ${Store.S.categories.map((c) => {
        const items = Store.S.items.filter((i) => i.catId === c.id);
        if (!items.length) return '';
        return `<div class="card flush mb"><div class="card-title" style="--c:${U.color(c.color)}">${U.esc(c.name)}</div>
          <table class="tbl"><thead><tr><th>Drink</th>${sizes.map((s) => `<th class="r">${U.esc(s.name)}<br><small>price · cost · %</small></th>`).join('')}<th>On sale</th></tr></thead>
          <tbody>${items.map((i) => `<tr class="click ${i.active ? '' : 'void'}" data-id="${i.id}">
            <td><b>${U.esc(i.name)}</b>${i.isNew ? ' <span class="ic-badge new">✨ NEW</span>' : ''}<br><small class="muted">${U.esc(i.desc || '')}</small></td>
            ${sizes.map((s) => {
              const sz = i.sizes.find((x) => x.sizeId === s.id);
              if (!sz) return '<td class="r muted">—</td>';
              const cost = Store.itemSizeCost(i, s.id);
              const sug = Store.suggestPrice(cost, target());
              return `<td class="r"><b>${U.money(sz.price)}</b> · ${U.money(cost)} ${fcBadge(cost, sz.price)}
                ${sug > sz.price ? `<br><small class="warn-text">suggest ${U.money(sug)}</small>` : ''}</td>`;
            }).join('')}
            <td><label class="switch" data-stop><input type="checkbox" data-toggle="${i.id}" ${i.active ? 'checked' : ''}><span></span></label></td>
          </tr>`).join('')}</tbody></table></div>`;
      }).join('')}
      ${Store.S.items.filter((i) => !Store.S.category[i.catId]).length ? '<p class="err">Some drinks have no category — edit them to assign one.</p>' : ''}`;
    U.$('#addItem', body).onclick = () => editItem(null);
    body.onclick = (e) => {
      if (e.target.closest('[data-stop]')) return;
      const tr = e.target.closest('tr[data-id]');
      if (tr) editItem(Store.S.item[tr.dataset.id]);
    };
    body.onchange = async (e) => {
      const t = e.target.closest('[data-toggle]');
      if (!t) return;
      const it = Store.S.item[t.dataset.toggle];
      await Store.save('items', { ...it, active: t.checked });
      U.toast(`${it.name} is ${t.checked ? 'on sale' : 'marked sold out'}`);
      draw();
    };
  }

  function editItem(item) {
    const isNew = !item;
    const sizes = Store.settings.sizes;
    const it = item ? JSON.parse(JSON.stringify(item)) : {
      id: U.uid(), catId: Store.S.categories[0]?.id || '', name: '', desc: '', active: true, isNew: true,
      allowSugar: true, allowIce: true, allowToppings: true, sort: Store.S.items.length, sizes: [{ sizeId: sizes[0]?.id, price: 0, recipe: [] }],
    };
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-grid">
        <div><label>Drink name</label><input type="text" id="iName" value="${U.esc(it.name)}" autofocus></div>
        <div><label>Category</label><select id="iCat">${Store.S.categories.map((c) => `<option value="${c.id}" ${c.id === it.catId ? 'selected' : ''}>${U.esc(c.name)}</option>`).join('')}</select></div>
        <div class="span2"><label>Short description (shown on menu)</label><input type="text" id="iDesc" value="${U.esc(it.desc || '')}"></div>
        <div><label>Label (e.g. Our Signature)</label><input type="text" id="iBadge" value="${U.esc(it.badge || '')}"></div>
        <div><label>Included toppings (free, part of the drink)</label><div class="checks">${Store.S.toppings.map((t) => `
          <label class="check"><input type="checkbox" data-inc="${t.id}" ${(it.included || []).includes(t.id) ? 'checked' : ''}> ${U.esc(t.name)}</label>`).join('')}</div>
          <small class="muted">Also put its ingredient in the recipe below so stock is deducted.</small></div>
        <div class="span2 checks">
          <label class="check"><input type="checkbox" id="iActive" ${it.active ? 'checked' : ''}> On sale</label>
          <label class="check" title="Shows a NEW badge and puts it in the ✨ New items tab on the Sell screen"><input type="checkbox" id="iNew" ${it.isNew ? 'checked' : ''}> ✨ New item (show in “New items” tab)</label>
          <label class="check"><input type="checkbox" id="iSugar" ${it.allowSugar ? 'checked' : ''}> Ask sugar level</label>
          <label class="check"><input type="checkbox" id="iIce" ${it.allowIce ? 'checked' : ''}> Ask ice level</label>
          <label class="check"><input type="checkbox" id="iTops" ${it.allowToppings ? 'checked' : ''}> Allow toppings</label>
        </div>
      </div>
      <h3 class="mt">Sizes, prices &amp; recipe</h3>
      <div id="iSizes"></div>`;
    const editors = {};
    const sizeBox = U.$('#iSizes', body);
    sizes.forEach((s) => {
      const sz = it.sizes.find((x) => x.sizeId === s.id);
      const wrap = document.createElement('div');
      wrap.className = 'size-edit' + (sz ? '' : ' disabled');
      wrap.innerHTML = `
        <div class="size-edit-head">
          <label class="check"><input type="checkbox" data-on ${sz ? 'checked' : ''}> <b>${U.esc(s.name)}</b> <small class="muted">${U.esc(s.volume || '')}</small></label>
          <label class="inline">Price ৳ <input type="number" min="0" data-price value="${sz ? sz.price : ''}" style="width:90px"></label>
          <span class="cost-info" data-cost></span>
          ${s.id !== sizes[0].id ? `<button type="button" class="btn sm ghost" data-copy>Copy ${U.esc(sizes[0].name)} recipe ×${Seed.LARGE_MULT}</button>` : ''}
        </div>
        <div data-rec></div>`;
      sizeBox.append(wrap);
      const upd = () => {
        const rec = editors[s.id].get();
        const cost = Store.recipeCost(rec) + Store.packagingCost(s.id);
        const price = U.n(U.$('[data-price]', wrap).value);
        const sug = Store.suggestPrice(cost, target());
        U.$('[data-cost]', wrap).innerHTML = `Cost ${U.money(cost, 1)} ${fcBadge(cost, price)} · Profit/cup ${U.money(price - cost)} · Suggested ${U.money(sug)}
          <small class="muted">(incl. packaging ${U.money(Store.packagingCost(s.id), 1)})</small>`;
      };
      editors[s.id] = recipeEditor(U.$('[data-rec]', wrap), sz ? sz.recipe : [], upd);
      U.$('[data-price]', wrap).addEventListener('input', upd);
      U.$('[data-on]', wrap).addEventListener('change', (e) => wrap.classList.toggle('disabled', !e.target.checked));
      const cp = U.$('[data-copy]', wrap);
      if (cp) cp.onclick = () => {
        const base = editors[sizes[0].id].get();
        editors[s.id].set(base.map((r) => ({ ingId: r.ingId, qty: Math.round(r.qty * Seed.LARGE_MULT * 10) / 10 })));
      };
      upd();
    });

    U.modal({
      title: isNew ? 'New drink' : `Edit: ${it.name}`,
      body,
      wide: true,
      actions: [
        ...(!isNew ? [{ label: 'Delete', cls: 'danger', left: true, onClick: async () => {
          if (!(await U.confirm(`Delete <b>${U.esc(it.name)}</b> from the menu? Past sales stay in reports.`, { ok: 'Delete', danger: true }))) return false;
          await Store.remove('items', it.id);
          U.toast('Drink deleted');
          draw();
          return true;
        } }] : []),
        { label: 'Cancel' },
        { label: 'Save', cls: 'primary', onClick: async () => {
          it.name = U.$('#iName', body).value.trim();
          if (!it.name) { U.toast('Give the drink a name', 'err'); return false; }
          it.catId = U.$('#iCat', body).value;
          it.desc = U.$('#iDesc', body).value.trim();
          it.badge = U.$('#iBadge', body).value.trim();
          it.included = U.$$('[data-inc]', body).filter((x) => x.checked).map((x) => x.dataset.inc);
          it.active = U.$('#iActive', body).checked;
          it.isNew = U.$('#iNew', body).checked;
          it.allowSugar = U.$('#iSugar', body).checked;
          it.allowIce = U.$('#iIce', body).checked;
          it.allowToppings = U.$('#iTops', body).checked;
          it.sizes = [];
          for (const wrap of U.$$('.size-edit', body)) {
            const idx = U.$$('.size-edit', body).indexOf(wrap);
            const s = sizes[idx];
            if (!U.$('[data-on]', wrap).checked) continue;
            const price = U.n(U.$('[data-price]', wrap).value);
            if (price <= 0) { U.toast(`Enter a price for ${s.name}`, 'err'); return false; }
            it.sizes.push({ sizeId: s.id, price, recipe: editors[s.id].get() });
          }
          if (!it.sizes.length) { U.toast('Turn on at least one size', 'err'); return false; }
          await Store.save('items', it);
          U.toast('Saved');
          draw();
          return true;
        } },
      ],
    });
  }

  /* ---------- toppings ---------- */
  function drawToppings(body) {
    body.innerHTML = `
      <div class="row-between mb"><p class="muted">Toppings are added on top of the drink price.</p><button class="btn primary" id="addTop">+ New topping</button></div>
      <div class="card flush"><table class="tbl"><thead><tr><th>Topping</th><th class="r">Price</th><th class="r">Cost</th><th class="r">Cost %</th><th>On sale</th></tr></thead>
      <tbody>${Store.S.toppings.map((t) => {
        const cost = Store.toppingCost(t);
        const fl = (t.flavours || []);
        return `<tr class="click ${t.active ? '' : 'void'}" data-id="${t.id}"><td><b>${U.esc(t.name)}</b>${fl.length ? `<br><small class="muted">Flavours: ${fl.map((f) => (f.active === false ? `<s>${U.esc(f.name)}</s>` : U.esc(f.name))).join(', ')}</small>` : ''}</td><td class="r">${U.money(t.price)}</td>
          <td class="r">${U.money(cost, 1)}</td><td class="r">${fcBadge(cost, t.price)}</td>
          <td><label class="switch" data-stop><input type="checkbox" data-toggle="${t.id}" ${t.active ? 'checked' : ''}><span></span></label></td></tr>`;
      }).join('') || '<tr><td class="empty">No toppings yet</td></tr>'}</tbody></table></div>`;
    U.$('#addTop', body).onclick = () => editTopping(null);
    body.onclick = (e) => {
      if (e.target.closest('[data-stop]')) return;
      const tr = e.target.closest('tr[data-id]');
      if (tr) editTopping(Store.S.topping[tr.dataset.id]);
    };
    body.onchange = async (e) => {
      const t = e.target.closest('[data-toggle]');
      if (!t) return;
      await Store.save('toppings', { ...Store.S.topping[t.dataset.toggle], active: t.checked });
      draw();
    };
  }

  function editTopping(t) {
    const isNew = !t;
    const tp = t ? JSON.parse(JSON.stringify(t)) : { id: U.uid(), name: '', price: 30, recipe: [], flavours: [], active: true, sort: Store.S.toppings.length };
    tp.flavours = tp.flavours || [];
    const body = document.createElement('div');
    body.innerHTML = `<div class="form-grid">
        <div><label>Name</label><input type="text" id="tName" value="${U.esc(tp.name)}" autofocus></div>
        <div><label>Price ৳ (same for every flavour)</label><input type="number" id="tPrice" min="0" value="${tp.price}"></div>
        <div class="span2"><label class="check"><input type="checkbox" id="tActive" ${tp.active ? 'checked' : ''}> On sale</label></div>
      </div>
      <h3 class="mt">Flavours <small class="muted">(optional: if any are added, the cashier must pick one)</small></h3>
      <div id="tFl"></div>
      <div id="tRecWrap"><h3 class="mt">Recipe (per drink)</h3><div id="tRec"></div></div><p class="cost-info" id="tCost"></p>`;
    const ingOpts = (sel) => '<option value="">— ingredient —</option>' + Store.S.ingredients.map((i) => `<option value="${i.id}" ${i.id === sel ? 'selected' : ''}>${U.esc(i.name)} (${U.esc(i.unit)})</option>`).join('');
    const flBox = U.$('#tFl', body);
    const paintFl = () => {
      flBox.innerHTML = `<table class="tbl compact"><thead><tr><th>Flavour</th><th>Ingredient used</th><th>Qty</th><th>Available</th><th></th></tr></thead><tbody>${tp.flavours.map((f, i) => `
        <tr data-fi="${i}"><td><input type="text" data-ff="name" value="${U.esc(f.name)}"></td>
        <td><select data-ff="ingId">${ingOpts(f.recipe?.[0]?.ingId)}</select></td>
        <td><input type="number" step="any" min="0" data-ff="qty" value="${f.recipe?.[0]?.qty ?? ''}" style="width:80px"></td>
        <td><input type="checkbox" data-ff="active" ${f.active !== false ? 'checked' : ''}></td>
        <td><button type="button" class="icon-btn" data-fdel="${i}">✕</button></td></tr>`).join('')}</tbody></table>
        <button type="button" class="btn sm ghost" data-fadd>+ Add flavour</button>`;
      U.$('#tRecWrap', body).hidden = tp.flavours.length > 0;
    };
    flBox.addEventListener('input', (e) => {
      const tr = e.target.closest('[data-fi]');
      if (!tr) return;
      const f = tp.flavours[Number(tr.dataset.fi)];
      const k = e.target.dataset.ff;
      f.recipe = f.recipe && f.recipe[0] ? f.recipe : [{ ingId: '', qty: 0 }];
      if (k === 'name') f.name = e.target.value;
      if (k === 'ingId') f.recipe[0].ingId = e.target.value;
      if (k === 'qty') f.recipe[0].qty = U.n(e.target.value);
      if (k === 'active') f.active = e.target.checked;
      upd();
    });
    flBox.addEventListener('click', (e) => {
      if (e.target.closest('[data-fadd]')) {
        const q = tp.flavours[0]?.recipe?.[0]?.qty || 30;
        tp.flavours.push({ id: U.uid(), name: '', active: true, recipe: [{ ingId: '', qty: q }] });
        paintFl(); upd();
      }
      const d = e.target.closest('[data-fdel]');
      if (d) { tp.flavours.splice(Number(d.dataset.fdel), 1); paintFl(); upd(); }
    });
    const upd = () => {
      const c = tp.flavours.length ? Store.recipeCost(tp.flavours[0].recipe || []) : Store.recipeCost(ed.get());
      U.$('#tCost', body).innerHTML = `Cost ${U.money(c, 1)} ${fcBadge(c, U.n(U.$('#tPrice', body).value))}`;
    };
    const ed = recipeEditor(U.$('#tRec', body), tp.recipe, upd);
    U.$('#tPrice', body).oninput = upd;
    paintFl();
    upd();
    U.modal({
      title: isNew ? 'New topping' : `Edit: ${tp.name}`,
      body,
      wide: true,
      actions: [
        ...(!isNew ? [{ label: 'Delete', cls: 'danger', left: true, onClick: async () => {
          if (!(await U.confirm(`Delete topping <b>${U.esc(tp.name)}</b>?`, { ok: 'Delete', danger: true }))) return false;
          await Store.remove('toppings', tp.id); draw(); return true;
        } }] : []),
        { label: 'Cancel' },
        { label: 'Save', cls: 'primary', onClick: async () => {
          tp.name = U.$('#tName', body).value.trim();
          if (!tp.name) { U.toast('Enter a name', 'err'); return false; }
          tp.price = U.n(U.$('#tPrice', body).value);
          tp.active = U.$('#tActive', body).checked;
          tp.recipe = ed.get();
          tp.flavours = tp.flavours.map((f) => ({ ...f, name: f.name.trim(), recipe: (f.recipe || []).filter((r) => r.ingId && U.n(r.qty) > 0) }));
          if (tp.flavours.some((f) => !f.name)) { U.toast('Give every flavour a name', 'err'); return false; }
          await Store.save('toppings', tp); draw(); return true;
        } },
      ],
    });
  }

  /* ---------- categories ---------- */
  function drawCategories(body) {
    body.innerHTML = `
      <div class="row-between mb"><p class="muted">Categories group the drinks on the Sell screen.</p><button class="btn primary" id="addCat">+ New category</button></div>
      <div class="card flush"><table class="tbl"><thead><tr><th>Order</th><th>Category</th><th>Drinks</th><th></th></tr></thead>
      <tbody>${Store.S.categories.map((c, i) => `<tr data-id="${c.id}">
        <td><button class="icon-btn" data-up="${i}" ${i ? '' : 'disabled'}>▲</button><button class="icon-btn" data-down="${i}" ${i < Store.S.categories.length - 1 ? '' : 'disabled'}>▼</button></td>
        <td><span class="dot" style="background:${U.color(c.color)}"></span> <b>${U.esc(c.name)}</b></td>
        <td>${Store.S.items.filter((x) => x.catId === c.id).length}</td>
        <td class="r"><button class="btn sm ghost" data-edit="${c.id}">Edit</button></td></tr>`).join('')}</tbody></table></div>`;
    U.$('#addCat', body).onclick = () => editCategory(null);
    body.onclick = async (e) => {
      const ed = e.target.closest('[data-edit]');
      if (ed) return editCategory(Store.S.category[ed.dataset.edit]);
      const up = e.target.closest('[data-up]');
      const dn = e.target.closest('[data-down]');
      if (up || dn) {
        const list = [...Store.S.categories];
        const i = Number((up || dn).dataset[up ? 'up' : 'down']);
        const j = up ? i - 1 : i + 1;
        [list[i], list[j]] = [list[j], list[i]];
        await DB.transact(['categories'], (o) => list.forEach((c, k) => o.categories.put({ ...c, sort: k })));
        await Store.reload(); Store.changed('categories'); draw();
      }
    };
  }

  function editCategory(c) {
    const isNew = !c;
    const cat = c ? { ...c } : { id: U.uid(), name: '', color: '#A8C3C9', sort: Store.S.categories.length };
    U.modal({
      title: isNew ? 'New category' : `Edit: ${cat.name}`,
      body: `<div class="form-grid"><div><label>Name</label><input type="text" id="cName" value="${U.esc(cat.name)}" autofocus></div>
        <div><label>Colour</label><input type="color" id="cColor" value="${U.color(cat.color)}"></div></div>`,
      actions: [
        ...(!isNew ? [{ label: 'Delete', cls: 'danger', left: true, onClick: async () => {
          if (Store.S.items.some((i) => i.catId === cat.id)) { U.toast('Move or delete the drinks in this category first', 'err'); return false; }
          await Store.remove('categories', cat.id); draw(); return true;
        } }] : []),
        { label: 'Cancel' },
        { label: 'Save', cls: 'primary', onClick: async (m) => {
          cat.name = U.$('#cName', m.el).value.trim();
          if (!cat.name) { U.toast('Enter a name', 'err'); return false; }
          cat.color = U.$('#cColor', m.el).value;
          await Store.save('categories', cat); draw(); return true;
        } },
      ],
    });
  }

  /* ---------- sizes & packaging ---------- */
  function drawSizes(body) {
    const sizes = Store.settings.sizes;
    body.innerHTML = `
      <div class="row-between mb"><p class="muted">Packaging (cup, film, straw, sticker) is added to the cost of every drink sold in that size.</p>
        <button class="btn primary" id="addSize">+ New size</button></div>
      <div class="card flush"><table class="tbl"><thead><tr><th>Size</th><th>Volume</th><th>Packaging per cup</th><th class="r">Packaging cost</th><th>Drinks</th><th></th></tr></thead>
      <tbody>${sizes.map((s) => `<tr><td><b>${U.esc(s.name)}</b></td><td>${U.esc(s.volume || '')}</td>
        <td>${(s.packaging || []).map((p) => `${U.qty(p.qty)} × ${U.esc(Store.S.ing[p.ingId]?.name || '?')}`).join(', ') || '<span class="muted">none</span>'}</td>
        <td class="r">${U.money(Store.packagingCost(s.id), 1)}</td>
        <td>${Store.S.items.filter((i) => i.sizes.some((x) => x.sizeId === s.id)).length}</td>
        <td class="r"><button class="btn sm ghost" data-edit="${s.id}">Edit</button></td></tr>`).join('')}</tbody></table></div>`;
    U.$('#addSize', body).onclick = () => editSize(null);
    body.onclick = (e) => {
      const b = e.target.closest('[data-edit]');
      if (b) editSize(sizes.find((s) => s.id === b.dataset.edit));
    };
  }

  function editSize(s) {
    const isNew = !s;
    const sz = s ? JSON.parse(JSON.stringify(s)) : { id: 'S' + U.uid().slice(-4).toUpperCase(), name: '', short: '', volume: '', packaging: [] };
    const body = document.createElement('div');
    body.innerHTML = `<div class="form-grid">
      <div><label>Name</label><input type="text" id="sName" value="${U.esc(sz.name)}" autofocus placeholder="Regular, Large, Hot…"></div>
      <div><label>Volume</label><input type="text" id="sVol" value="${U.esc(sz.volume || '')}" placeholder="500 ml"></div></div>
      <h3 class="mt">Packaging per cup</h3><div id="sRec"></div>`;
    const ed = recipeEditor(U.$('#sRec', body), sz.packaging, null);
    U.modal({
      title: isNew ? 'New size' : `Edit size: ${sz.name}`,
      body,
      wide: true,
      actions: [
        ...(!isNew ? [{ label: 'Delete', cls: 'danger', left: true, onClick: async () => {
          if (Store.S.items.some((i) => i.sizes.some((x) => x.sizeId === sz.id))) { U.toast('Some drinks still use this size', 'err'); return false; }
          await Store.saveSettings({ sizes: Store.settings.sizes.filter((x) => x.id !== sz.id) }); draw(); return true;
        } }] : []),
        { label: 'Cancel' },
        { label: 'Save', cls: 'primary', onClick: async () => {
          sz.name = U.$('#sName', body).value.trim();
          if (!sz.name) { U.toast('Enter a name', 'err'); return false; }
          sz.short = sz.name;
          sz.volume = U.$('#sVol', body).value.trim();
          sz.packaging = ed.get();
          const list = [...Store.settings.sizes];
          const i = list.findIndex((x) => x.id === sz.id);
          if (i >= 0) list[i] = sz; else list.push(sz);
          await Store.saveSettings({ sizes: list }); draw(); return true;
        } },
      ],
    });
  }

  return { render };
})();
