'use strict';
/* Settings: shop details, printing, selling options, PIN, backup/restore. */
Views.settings = (() => {
  let root = null;
  const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

  function sampleOrder() {
    const item = Store.S.items.find((i) => i.active) || Store.S.items[0];
    const sz = item?.sizes[0];
    const top = Store.S.toppings[0];
    const lines = item ? [{
      itemId: item.id, name: item.name, sizeId: sz.sizeId, sizeName: Store.sizeLabel(sz.sizeId), basePrice: sz.price,
      toppings: top ? [{ id: top.id, name: top.name, price: top.price }] : [], sugar: '50%', ice: 'Less ice', note: 'Test print', qty: 2,
      unitPrice: sz.price + (top ? top.price : 0), lineTotal: (sz.price + (top ? top.price : 0)) * 2, cost: 0,
    }] : [];
    const total = U.sum(lines, (l) => l.lineTotal);
    return {
      no: 0, at: new Date().toISOString(), orderType: 'Takeaway', customerName: 'Test', customerPhone: '', lines, cups: 2,
      subtotal: total, discount: 0, vat: 0, total, payMethod: 'Cash', received: Math.ceil(total / 100) * 100, change: Math.ceil(total / 100) * 100 - total, status: 'paid',
    };
  }

  function render(el) {
    root = el;
    const s = Store.settings;
    el.innerHTML = `
      <div class="page-head"><h1>Settings</h1><div class="tools"><button class="btn primary" id="sSave">💾 Save settings</button></div></div>
      <div class="settings">
        <div class="card"><h3>🏪 Shop details <small class="muted">(printed on the bill)</small></h3>
          <div class="form-grid">
            <div><label>Shop name</label><input data-k="shopName" value="${U.esc(s.shopName)}"></div>
            <div><label>Tagline</label><input data-k="tagline" value="${U.esc(s.tagline)}"></div>
            <div class="span2"><label>Address</label><input data-k="address" value="${U.esc(s.address)}"></div>
            <div><label>Phone</label><input data-k="phone" value="${U.esc(s.phone)}"></div>
            <div><label>Facebook / Instagram</label><input data-k="social" value="${U.esc(s.social)}"></div>
            <div><label>VAT BIN (if registered)</label><input data-k="bin" value="${U.esc(s.bin)}"></div>
          </div></div>

        <div class="card"><h3>🧾 Bill (receipt) printer</h3>
          <div class="form-grid">
            <div class="span2"><label>Printing method</label><select data-k="printMode">
              <option value="direct" ${s.printMode !== 'browser' ? 'selected' : ''}>Direct to printer (recommended): exact length, no print window</option>
              <option value="browser" ${s.printMode === 'browser' ? 'selected' : ''}>Browser print window</option></select></div>
            <div class="span2 helper-box" id="sHelper"><span class="muted">Checking print helper…</span></div>
            <div class="span2" id="sPrinterRow"><label>Bill printer</label>
              <div class="tools"><select data-k="receiptPrinter" id="sPrinter" style="flex:1"><option value="${U.esc(s.receiptPrinter || '')}">${U.esc(s.receiptPrinter || 'Auto-detect')}</option></select>
              <button class="btn sm ghost" id="sPrRefresh" type="button">↻ Refresh</button></div></div>
            <div><label>Paper width</label><select data-k="paperWidth" data-num><option value="58" ${s.paperWidth != 80 ? 'selected' : ''}>58 mm (e.g. Rongta RP58)</option><option value="80" ${s.paperWidth == 80 ? 'selected' : ''}>80 mm</option></select></div>
            <div><label>Text size (px)</label><input type="number" data-k="receiptFontPx" data-num min="9" max="16" value="${s.receiptFontPx}"></div>
            <div class="span2"><label>Kitchen copy</label><select data-k="kitchenMode">
              <option value="manual" ${s.kitchenMode !== 'auto' ? 'selected' : ''}>Wait: I tear off the customer bill, then press Print (no auto-cutter)</option>
              <option value="auto" ${s.kitchenMode === 'auto' ? 'selected' : ''}>Print automatically right after the bill (printer has an auto-cutter)</option></select></div>
            <div><label>Image mode (direct)</label><select data-k="imageMode">
              <option value="raster" ${s.imageMode !== 'compat' ? 'selected' : ''}>Standard (fast)</option>
              <option value="compat" ${s.imageMode === 'compat' ? 'selected' : ''}>Compatibility: use if bill prints strange symbols</option></select></div>
            <div><label>Space above first line (mm)</label><input type="number" data-k="marginTopMm" data-num min="0" max="30" step="1" value="${s.marginTopMm ?? 5}"></div>
            <div><label>Space after last line (mm) <small class="muted">so tearing doesn't cut text</small></label><input type="number" data-k="marginBottomMm" data-num min="0" max="40" step="1" value="${s.marginBottomMm ?? 16}"></div>
            <div class="checks" style="align-items:flex-end">
              <label class="check"><input type="checkbox" data-k="receiptCut" ${s.receiptCut ? 'checked' : ''}> Auto-cut paper</label>
              <label class="check"><input type="checkbox" data-k="openDrawer" ${s.openDrawer ? 'checked' : ''}> Open cash drawer</label>
            </div>
            <div class="span2"><label>Bill footer message</label><textarea data-k="receiptFooter" rows="2">${U.esc(s.receiptFooter)}</textarea></div>
            <div class="span2 checks">
              <label class="check"><input type="checkbox" data-k="receiptLogo" ${s.receiptLogo ? 'checked' : ''}> Print logo on bill</label>
              <label class="check"><input type="checkbox" data-k="printReceiptDefault" ${s.printReceiptDefault ? 'checked' : ''}> Tick “Customer bill” by default</label>
              <label class="check"><input type="checkbox" data-k="printKitchenDefault" ${s.printKitchenDefault !== false ? 'checked' : ''}> Tick “Kitchen copy” by default</label>
            </div>
            <div class="span2 logo-row"><img id="sLogoPrev" src="${s.logoData || LOGO_PRINT}" alt="logo">
              <div><label>Bill logo (black &amp; white works best on thermal paper)</label>
                <input type="file" id="sLogo" accept="image/*"> <button class="btn sm ghost" id="sLogoReset">Use default</button></div></div>
          </div>
          <div class="tools mt"><button class="btn ghost" id="sTestR">🖨 Test print bill</button><button class="btn ghost" id="sTestK">👩‍🍳 Test kitchen copy</button><button class="btn ghost" id="sTestSp">📏 Spacing test</button></div></div>

        <div class="card"><h3>🏷 Cup sticker printer</h3>
          <div class="form-grid">
            <div class="span2 checks">
              <label class="check"><input type="checkbox" data-k="stickersEnabled" ${s.stickersEnabled ? 'checked' : ''}> Use cup stickers</label>
              <label class="check"><input type="checkbox" data-k="printStickerDefault" ${s.printStickerDefault ? 'checked' : ''}> Tick “Print stickers” by default</label>
              <label class="check"><input type="checkbox" data-k="stickerShowShop" ${s.stickerShowShop ? 'checked' : ''}> Show shop name on sticker</label>
            </div>
            <div><label>Sticker width (mm)</label><input type="number" data-k="stickerW" data-num min="25" max="100" value="${s.stickerW}"></div>
            <div><label>Sticker height (mm)</label><input type="number" data-k="stickerH" data-num min="15" max="100" value="${s.stickerH}"></div>
            <div class="span2 chips">${[[40, 30], [50, 30], [50, 25], [60, 40], [40, 20]].map(([w, h]) => `<button class="chip" data-wh="${w}x${h}">${w}×${h} mm</button>`).join('')}</div>
          </div>
          <button class="btn ghost mt" id="sTestS">🖨 Test print sticker</button></div>

        <div class="card"><h3>🧋 Selling</h3>
          <div class="form-grid">
            <div class="span2"><label>Order types (comma separated)</label><input data-k="orderTypes" data-list value="${U.esc(s.orderTypes.join(', '))}"></div>
            <div class="span2"><label>Payment methods</label><input data-k="payMethods" data-list value="${U.esc(s.payMethods.join(', '))}"></div>
            <div><label>Sugar levels</label><input data-k="sugarLevels" data-list value="${U.esc(s.sugarLevels.join(', '))}"></div>
            <div><label>Default sugar</label><input data-k="defaultSugar" value="${U.esc(s.defaultSugar)}"></div>
            <div><label>Ice levels</label><input data-k="iceLevels" data-list value="${U.esc(s.iceLevels.join(', '))}"></div>
            <div><label>Default ice</label><input data-k="defaultIce" value="${U.esc(s.defaultIce)}"></div>
            <div><label>Quick discount buttons (%)</label><input data-k="discountPresets" data-list data-num value="${U.esc((s.discountPresets || []).join(', '))}"></div>
            <div><label>Loyalty: free drink every N cups (0 = off)</label><input type="number" data-k="loyaltyEvery" data-num min="0" value="${s.loyaltyEvery}"></div>
            <div><label>VAT %</label><input type="number" data-k="vatPct" data-num min="0" max="30" step="any" value="${s.vatPct}"></div>
            <div><label>VAT mode</label><select data-k="vatMode"><option value="exclusive" ${s.vatMode === 'exclusive' ? 'selected' : ''}>Added on top of price</option><option value="inclusive" ${s.vatMode === 'inclusive' ? 'selected' : ''}>Already included in price</option></select></div>
            <div><label>Business day starts at (hour, 0–6)</label><input type="number" data-k="dayStartHour" data-num min="0" max="6" value="${s.dayStartHour}"></div>
            <div><label>Target ingredient cost %</label><input type="number" data-k="targetFoodCost" data-num min="10" max="80" value="${s.targetFoodCost}"></div>
          </div>
          <p class="muted small mt">Business day: sales after midnight but before this hour count for the previous day (useful if you close late).</p></div>

        <div class="card"><h3>🎁 Promotion: free topping</h3>
          <p class="muted small">One topping free per drink (the most expensive one the customer adds). Toppings included in a drink are always free anyway.</p>
          <div class="form-grid">
            <div class="span2"><label class="check"><input type="checkbox" id="pOn" ${s.promo?.enabled ? 'checked' : ''}> Promotion on</label>
              <span id="pState" class="small"></span></div>
            <div class="span2"><label>Name (printed on the bill)</label><input type="text" id="pName" value="${U.esc(s.promo?.name || '')}"></div>
            <div><label>From</label><input type="date" id="pFrom" value="${s.promo?.from || ''}"></div>
            <div><label>To</label><input type="date" id="pTo" value="${s.promo?.to || ''}"></div>
          </div>
          <div class="tools mt"><button class="btn ghost sm" id="pToday" type="button">Today only</button></div></div>

        <div class="card"><h3>🔒 Manager PIN</h3>
          <p class="muted">${s.pin ? 'A PIN is set. Menu, Expenses, Reports, Settings and voiding orders need it.' : 'No PIN set. Anyone using the laptop can open every screen. Set a PIN before hiring staff.'}</p>
          <div class="tools"><button class="btn ghost" id="sPin">${s.pin ? 'Change PIN' : 'Set PIN'}</button>${s.pin ? '<button class="btn danger" id="sPinOff">Remove PIN</button>' : ''}</div></div>

        <div class="card"><h3>💾 Data &amp; backup</h3>
          <p class="muted">All data is saved on this laptop. Back up daily and copy the file to Google Drive, a pen drive or email it to yourself.</p>
          <p id="sStorage" class="small muted"></p>
          <p class="small">Last backup: <b>${s.lastBackupAt ? U.fmtDateTime(s.lastBackupAt) : 'never'}</b></p>
          <div class="tools">
            <button class="btn primary" id="sBackup">⬇ Backup now</button>
            <label class="btn ghost file-btn">⬆ Restore from backup<input type="file" id="sRestore" accept=".json,application/json" hidden></label>
          </div>
          <h4 class="mt">Before opening / start fresh</h4>
          <div class="tools">
            <button class="btn danger" id="sClearSales">Delete test orders &amp; expenses</button>
            <button class="btn danger" id="sReset">Reset everything to demo</button>
          </div></div>
      </div>`;

    U.$('#sSave', el).onclick = save;
    U.$$('[data-wh]', el).forEach((b) => { b.onclick = () => {
      const [w, h] = b.dataset.wh.split('x');
      U.$('[data-k="stickerW"]', el).value = w; U.$('[data-k="stickerH"]', el).value = h;
    }; });
    U.$('#sLogo', el).onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 400 * 1024) { U.toast('Please use a smaller image (under 400 KB)', 'err'); return; }
      const data = await U.readFile(f, true);
      await Store.saveSettings({ logoData: data });
      U.$('#sLogoPrev', el).src = data;
      U.toast('Bill logo updated');
    };
    U.$('#sLogoReset', el).onclick = async () => { await Store.saveSettings({ logoData: '' }); U.$('#sLogoPrev', el).src = LOGO_PRINT; };
    U.$('#sTestR', el).onclick = async () => {
      if (!(await save(true))) return;
      const r = await Print.receipt(sampleOrder());
      if (r && r.direct) U.toast(`Test bill sent to ${Store.settings.receiptPrinter}`);
    };
    U.$('#sTestSp', el).onclick = async () => { if (await save(true)) Print.spacingTest(); };
    U.$('#sTestK', el).onclick = async () => { if (await save(true)) Print.kitchen(sampleOrder()); };
    U.$('#sPrRefresh', el).onclick = () => checkHelper(el);
    U.$('[data-k="printMode"]', el).onchange = () => checkHelper(el);
    checkHelper(el);
    const promoState = () => {
      const on = U.$('#pOn', el).checked; const f = U.$('#pFrom', el).value; const t = U.$('#pTo', el).value; const d = Store.businessDay();
      U.$('#pState', el).innerHTML = !on ? '<span class="muted">Off</span>' : (f && t && d >= f && d <= t) ? '<span class="good-text">● Running today</span>'
        : (f && d < f) ? '<span class="warn-text">Starts ' + U.esc(U.fmtDay(f)) + '</span>' : '<span class="muted">Ended / dates not set</span>';
    };
    ['#pOn', '#pFrom', '#pTo'].forEach((k) => { U.$(k, el).onchange = promoState; });
    U.$('#pToday', el).onclick = () => { U.$('#pFrom', el).value = U.$('#pTo', el).value = Store.businessDay(); U.$('#pOn', el).checked = true; promoState(); };
    promoState();
    U.$('#sTestS', el).onclick = async () => { if (await save(true)) Print.stickers(sampleOrder()); };
    U.$('#sPin', el).onclick = setPin;
    const off = U.$('#sPinOff', el);
    if (off) off.onclick = async () => {
      if (await U.confirm('Remove the manager PIN?', { ok: 'Remove', danger: true })) { await Store.saveSettings({ pin: '' }); render(el); }
    };
    U.$('#sBackup', el).onclick = async () => { await App.backupNow(); render(el); };
    U.$('#sRestore', el).onchange = restore;
    U.$('#sClearSales', el).onclick = async () => {
      if (!(await U.confirm('Delete <b>all orders, expenses, stock history and day closes</b>? Menu, recipes and current stock levels are kept.<br><br>Use this after practising, before your real opening. Do a stock count afterwards.', { ok: 'Delete all sales', danger: true }))) return;
      await App.backupNow();
      await Store.clearSales();
      localStorage.removeItem('bb-cart');
      U.toast('Test data deleted (a backup was downloaded first)');
    };
    U.$('#sReset', el).onclick = async () => {
      if (!(await U.confirm('Erase <b>everything</b> (menu, stock, sales, settings) and load the demo menu again?', { ok: 'Erase everything', danger: true }))) return;
      await App.backupNow();
      await Store.resetEverything();
      localStorage.removeItem('bb-cart');
      U.toast('Reset done (a backup was downloaded first)');
      render(el);
    };
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(async (est) => {
        const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
        U.$('#sStorage', el).textContent = `Using ${(est.usage / 1048576).toFixed(1)} MB${persisted ? ' · protected from automatic clean-up ✓' : ''}`;
      }).catch(() => {});
    }
  }

  async function checkHelper(el) {
    const box = U.$('#sHelper', el);
    const sel = U.$('#sPrinter', el);
    const direct = U.$('[data-k="printMode"]', el).value !== 'browser';
    U.$('#sPrinterRow', el).hidden = !direct;
    if (!direct) {
      box.innerHTML = `<span class="muted">Bills print through the Edge print window. If the paper keeps feeding after the bill, switch back to <b>Direct</b>.</span>`;
      return;
    }
    box.innerHTML = '<span class="muted">Checking print helper…</span>';
    try {
      const { printers, default: def } = await Receipt.helper.printers(6000);
      const cur = Store.settings.receiptPrinter;
      const guess = cur || printers.find((p) => /rp58|rp80|rongta|pos-?58|pos-?80|xprinter|thermal|receipt/i.test(p)) || def || '';
      sel.innerHTML = printers.map((p) => `<option value="${U.esc(p)}" ${p === guess ? 'selected' : ''}>${U.esc(p)}${p === def ? ' (Windows default)' : ''}</option>`).join('')
        || '<option value="">No printers found</option>';
      if (cur && !printers.includes(cur)) sel.insertAdjacentHTML('afterbegin', `<option value="${U.esc(cur)}" selected>${U.esc(cur)} (not found!)</option>`);
      box.innerHTML = `<span class="good-text">✓ Print helper is running</span> <span class="muted">· ${printers.length} printer${printers.length === 1 ? '' : 's'} found. Pick your bill printer, then <b>Save</b> and <b>Test print bill</b>.</span>`;
    } catch (err) {
      box.innerHTML = `<span class="err">✗ Print helper is not running.</span> <span class="muted">Close the POS and open it again with the <b>Bubble Blush POS</b> desktop shortcut
        (or <b>Start Bubble Blush POS.bat</b>). If Edge asks to allow access to local devices or apps, click <b>Allow</b>. Until then bills use the print window.</span>`;
    }
  }

  async function save(silent = false) {
    const patch = {};
    U.$$('[data-k]', root).forEach((inp) => {
      const k = inp.dataset.k;
      let v;
      if (inp.type === 'checkbox') v = inp.checked;
      else if ('list' in inp.dataset) { v = list(inp.value); if ('num' in inp.dataset) v = v.map(Number).filter((x) => x > 0); }
      else if ('num' in inp.dataset) v = U.n(inp.value);
      else v = inp.value.trim();
      patch[k] = v;
    });
    for (const k of ['orderTypes', 'payMethods', 'sugarLevels', 'iceLevels']) {
      if (!patch[k].length) { U.toast(`“${k}” cannot be empty`, 'err'); return false; }
    }
    if (!patch.sugarLevels.includes(patch.defaultSugar)) patch.defaultSugar = patch.sugarLevels[patch.sugarLevels.length - 1];
    if (!patch.iceLevels.includes(patch.defaultIce)) patch.defaultIce = patch.iceLevels[Math.min(2, patch.iceLevels.length - 1)];
    patch.dayStartHour = Math.max(0, Math.min(6, Math.round(patch.dayStartHour)));
    if (!patch.shopName) patch.shopName = 'Bubble Blush';
    patch.marginTopMm = Math.max(0, Math.min(30, Math.round(patch.marginTopMm)));
    patch.marginBottomMm = Math.max(0, Math.min(40, Math.round(patch.marginBottomMm)));
    let from = U.$('#pFrom', root).value; let to = U.$('#pTo', root).value;
    if (from && to && from > to) [from, to] = [to, from];
    patch.promo = { enabled: U.$('#pOn', root).checked, name: U.$('#pName', root).value.trim() || 'Free Topping', from, to };
    if (patch.promo.enabled && (!from || !to)) { U.toast('Set the promotion From and To dates', 'err'); return false; }
    await Store.saveSettings(patch);
    if (!silent) { U.toast('Settings saved'); render(root); }
    return true;
  }

  function setPin() {
    U.modal({
      title: 'Set manager PIN',
      body: `<div class="form-grid"><div><label>New PIN (4–8 digits)</label><input type="password" inputmode="numeric" id="p1" autofocus></div>
        <div><label>Repeat PIN</label><input type="password" inputmode="numeric" id="p2"></div></div>`,
      actions: [{ label: 'Cancel' }, { label: 'Save PIN', cls: 'primary', onClick: async (m) => {
        const a = U.$('#p1', m.el).value; const b = U.$('#p2', m.el).value;
        if (!/^\d{4,8}$/.test(a)) { U.toast('PIN must be 4–8 digits', 'err'); return false; }
        if (a !== b) { U.toast('PINs do not match', 'err'); return false; }
        await Store.saveSettings({ pin: a });
        U.toast('PIN saved — don’t forget it!');
        render(root);
        return true;
      } }],
    });
  }

  async function restore(e) {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    let json;
    try { json = JSON.parse(await U.readFile(f)); } catch { U.toast('That file is not a valid backup', 'err'); return; }
    const when = json.exportedAt ? U.fmtDateTime(json.exportedAt) : 'unknown date';
    const n = (json.data?.orders || []).length;
    if (!(await U.confirm(`Restore backup from <b>${when}</b> (${n} orders)?<br>Everything currently in the POS will be replaced.`, { ok: 'Restore', danger: true }))) return;
    try {
      await Store.importAll(json);
      localStorage.removeItem('bb-cart');
      U.toast('Backup restored');
      render(root);
    } catch (err) {
      U.toast(err.message || String(err), 'err', 6000);
    }
  }

  return { render };
})();
