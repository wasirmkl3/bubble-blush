'use strict';
/*
 * Bills and day reports for thermal receipt printers.
 *
 * A bill is described once as a list of simple "ops" (text, row, line, logo…) and
 * then either:
 *   - drawn to a canvas at the printer's real dot width and sent as ESC/POS raster
 *     through the local print helper (DIRECT: exact length, no dialog, no blank tail), or
 *   - turned into HTML for the normal browser print dialog (fallback).
 */
const Receipt = (() => {
  const HELPER = 'http://127.0.0.1:17846';
  const FONT = 'Arial, "Nirmala UI", "Segoe UI", "Noto Sans Bengali", sans-serif';

  /* ---------- paper geometry ---------- */
  function paper() {
    const w = Number(Store.settings.paperWidth) === 80 ? 80 : 58;
    // Print heads are narrower than the roll: 58 mm roll = 48 mm / 384 dots, 80 mm = 72 mm / 576 dots (203 dpi).
    return w === 80 ? { roll: 80, mm: 72, dots: 576 } : { roll: 58, mm: 48, dots: 384 };
  }

  /* ---------- content ---------- */
  function receiptOps(order, { reprint = false } = {}) {
    const st = Store.settings;
    const m = (n) => U.money(n);
    const ops = [];
    if (st.receiptLogo) ops.push({ t: 'img', src: st.logoData || LOGO_PRINT, w: 0.55 });
    else ops.push({ t: 'text', s: st.shopName, a: 'c', b: true, z: 1.5 });
    if (st.tagline) ops.push({ t: 'text', s: st.tagline, a: 'c', z: 0.9 });
    if (st.address) ops.push({ t: 'text', s: st.address, a: 'c', z: 0.9 });
    if (st.phone) ops.push({ t: 'text', s: st.phone, a: 'c', z: 0.9 });
    if (st.bin) ops.push({ t: 'text', s: `BIN: ${st.bin}`, a: 'c', z: 0.9 });
    if (reprint) ops.push({ t: 'tag', s: 'REPRINT' });
    if (order.status === 'void') ops.push({ t: 'tag', s: 'VOID – NOT PAID' });
    if (order.status === 'unpaid') ops.push({ t: 'tag', s: 'NOT PAID YET' });
    ops.push({ t: 'hr' });
    ops.push({ t: 'text', s: `Order #${order.no}`, a: 'c', b: true, z: 1.7 });
    ops.push({ t: 'text', s: order.orderType, a: 'c', b: true });
    ops.push({ t: 'row', l: U.fmtDateTime(order.at), r: `${order.cups} cup${order.cups === 1 ? '' : 's'}`, z: 0.9 });
    if (order.customerName || order.customerPhone) {
      ops.push({ t: 'text', s: `Customer: ${[order.customerName, order.customerPhone].filter(Boolean).join(' ')}`, z: 0.9 });
    }
    ops.push({ t: 'hr' });
    order.lines.forEach((l, i) => {
      if (i) ops.push({ t: 'gap', h: 0.25 });
      if (Store.isToppingLine(l)) ops.push({ t: 'text', s: `${l.qty} × Extra topping (no drink)`, b: true });
      else ops.push({ t: 'row', l: `${l.qty} × ${l.name} (${l.sizeName})`, r: m(l.basePrice * l.qty), b: true });
      if (l.parcel) ops.push({ t: 'text', s: '** PARCEL **', b: true, i: 1 });
      if (l.sugar) ops.push({ t: 'text', s: `Sugar: ${l.sugar}`, z: 0.9, i: 1 });
      if (l.ice) ops.push({ t: 'text', s: `Ice: ${l.ice}`, z: 0.9, i: 1 });
      const inc = Store.lineIncluded(l);
      if (inc.length) ops.push({ t: 'text', s: `Included: ${inc.join(', ')}`, z: 0.9, i: 1 });
      (l.toppings || []).forEach((tp, k) => {
        ops.push({ t: 'row', l: `+ ${Store.topName(tp)}`, r: m(tp.price * Store.topQty(tp) * l.qty), z: 0.9, i: 1 });
        if (l.promo && k === l.promoIndex) ops.push({ t: 'row', l: order.promoName || 'Free topping', r: '-' + m(l.promo * l.qty), z: 0.9, i: 2 });
      });
      if (l.note) ops.push({ t: 'text', s: `Note: ${l.note}`, z: 0.9, i: 1 });
    });
    ops.push({ t: 'hr' });
    ops.push({ t: 'row', l: 'Subtotal', r: m(order.subtotal) });
    if (order.promo > 0) ops.push({ t: 'row', l: 'Promotional Discount', r: '-' + m(order.promo) });
    if (order.discount > 0) {
      const d = order.discountInfo || {};
      ops.push({ t: 'row', l: `Discount${d.type === 'pct' ? ` (${d.value}%)` : ''}${d.reason ? ' – ' + d.reason : ''}`, r: '-' + m(order.discount) });
    }
    if (order.vat > 0) ops.push({ t: 'row', l: `VAT ${order.vatPct}%${order.vatMode === 'inclusive' ? ' (included)' : ''}`, r: m(order.vat) });
    if (order.deliveryCharge > 0) ops.push({ t: 'row', l: 'Delivery charge', r: m(order.deliveryCharge) });
    if (order.packagingCharge > 0) ops.push({ t: 'row', l: 'Packaging', r: m(order.packagingCharge) });
    ops.push({ t: 'row', l: 'TOTAL', r: m(order.total), b: true, z: 1.45 });
    if (order.status !== 'unpaid') ops.push({ t: 'row', l: 'Paid by', r: order.payMethod });
    if (order.status !== 'unpaid' && order.payMethod === 'Cash') {
      ops.push({ t: 'row', l: 'Cash received', r: m(order.received) });
      ops.push({ t: 'row', l: 'Change', r: m(order.change) });
    }
    if (order.note) { ops.push({ t: 'hr' }); ops.push({ t: 'text', s: `Note: ${order.note}`, z: 0.9 }); }
    ops.push({ t: 'hr' });
    String(st.receiptFooter || '').split('\n').filter((x) => x.trim()).forEach((x) => ops.push({ t: 'text', s: x, a: 'c', z: 0.9 }));
    if (st.social) ops.push({ t: 'text', s: st.social, a: 'c', b: true, z: 0.9 });
    return ops;
  }

  /* Kitchen ticket: what to make, big and clear, no prices. */
  function kitchenOps(order, { reprint = false } = {}) {
    const ops = [{ t: 'tag', s: reprint ? 'KITCHEN · REPRINT' : 'KITCHEN COPY' }];
    ops.push({ t: 'text', s: `#${order.no}`, a: 'c', b: true, z: 2.6 });
    ops.push({ t: 'text', s: order.orderType, a: 'c', b: true, z: 1.3 });
    ops.push({ t: 'row', l: U.fmtTime(order.at), r: `${order.cups} cup${order.cups === 1 ? '' : 's'}`, b: true });
    if (order.customerName) ops.push({ t: 'text', s: `Name: ${order.customerName}`, b: true, z: 1.2 });
    ops.push({ t: 'hr' });
    const parcels = order.lines.filter((l) => l.parcel).length;
    if (parcels && parcels < order.lines.length) ops.push({ t: 'text', s: `Parcel: ${parcels} of ${order.lines.length} items`, b: true });
    order.lines.forEach((l, i) => {
      if (i) ops.push({ t: 'hr' });
      if (Store.isToppingLine(l)) {
        ops.push({ t: 'text', s: `${l.qty} × EXTRA TOPPING`, b: true, z: 1.3 });
        ops.push({ t: 'text', s: '(no drink, toppings only)', z: 1.0, i: 1 });
      } else {
        ops.push({ t: 'text', s: `${l.qty} × ${l.name}`, b: true, z: 1.3 });
        ops.push({ t: 'text', s: `Size: ${l.sizeName}`, z: 1.15, i: 1 });
      }
      if (l.parcel) ops.push({ t: 'tag', s: 'PARCEL' });
      const sl = Store.settings.sugarLabels?.[l.sugar];
      if (l.sugar) ops.push({ t: 'text', s: `Sugar: ${l.sugar}${sl ? ` (${sl})` : ''}`, z: 1.15, i: 1 });
      if (l.ice) ops.push({ t: 'text', s: `Ice: ${l.ice}`, z: 1.15, i: 1 });
      // Included toppings are part of the drink: print them like toppings so they are not missed.
      Store.lineIncluded(l).forEach((n) => ops.push({ t: 'text', s: `+ ${n} (included)`, b: true, z: 1.15, i: 1 }));
      (l.toppings || []).forEach((tp) => ops.push({ t: 'text', s: `+ ${Store.topQty(tp) > 1 ? `DOUBLE ${tp.name} (x2)` : tp.name}`, b: true, z: 1.15, i: 1 }));
      if (l.note) ops.push({ t: 'text', s: `NOTE: ${l.note}`, b: true, z: 1.15, i: 1 });
    });
    const note = String(order.note || '').split(' · ').filter((x) => !/^TrxID:/.test(x)).join(' · ');
    if (note) { ops.push({ t: 'hr' }); ops.push({ t: 'text', s: `ORDER NOTE: ${note}`, b: true, z: 1.15 }); }
    ops.push({ t: 'hr' });
    return ops;
  }

  /* Short test strip for setting the top/bottom space. */
  function spacingTestOps() {
    const mg = margins();
    return [
      { t: 'text', s: '>>> FIRST LINE <<<', a: 'c', b: true, z: 1.2 },
      { t: 'text', s: `Space above: ${mg.top} mm`, a: 'c', z: 0.9 },
      { t: 'hr' },
      { t: 'text', s: 'Tear the paper, then check:', z: 0.9 },
      { t: 'text', s: '• First line cut? Increase Space above.', z: 0.9 },
      { t: 'text', s: '• Last line cut? Increase Space below.', z: 0.9 },
      { t: 'text', s: '• Too much blank paper? Decrease it.', z: 0.9 },
      { t: 'hr' },
      { t: 'text', s: `Space below: ${mg.bottom} mm`, a: 'c', z: 0.9 },
      { t: 'text', s: '>>> LAST LINE <<<', a: 'c', b: true, z: 1.2 },
    ];
  }

  function dayReportOps(r) {
    const st = Store.settings;
    const m = (n) => U.money(n);
    const ops = [
      { t: 'text', s: st.shopName, a: 'c', b: true, z: 1.4 },
      { t: 'text', s: r.title, a: 'c', b: true },
      { t: 'text', s: r.range, a: 'c' },
      { t: 'text', s: `Printed ${U.fmtDateTime(new Date().toISOString())}`, a: 'c', z: 0.85 },
      { t: 'hr' },
      { t: 'row', l: 'Orders', r: String(r.orders) },
      { t: 'row', l: 'Cups sold', r: String(r.cups) },
      { t: 'row', l: 'Gross sales', r: m(r.gross) },
    ];
    if (r.promo) ops.push({ t: 'row', l: `Promotion (${r.promoCups} free toppings)`, r: '-' + m(r.promo) });
    ops.push({ t: 'row', l: 'Discounts', r: '-' + m(r.discount) });
    if (r.vat) ops.push({ t: 'row', l: 'VAT', r: m(r.vat) });
    if (r.deliveryCharges) ops.push({ t: 'row', l: 'Delivery charges', r: m(r.deliveryCharges) });
    if (r.packagingCharges) ops.push({ t: 'row', l: 'Packaging charges', r: m(r.packagingCharges) });
    ops.push({ t: 'row', l: 'NET SALES', r: m(r.net), b: true, z: 1.3 });
    if (r.voids) ops.push({ t: 'row', l: `Voided (${r.voids})`, r: m(r.voidValue) });
    if (r.unpaid) ops.push({ t: 'row', l: `NOT PAID YET (${r.unpaid})`, r: m(r.unpaidValue), b: true });
    ops.push({ t: 'hr' }, { t: 'text', s: 'Payments', b: true });
    r.payments.forEach((p) => ops.push({ t: 'row', l: `${p.method} (${p.count})`, r: m(p.amount) }));
    ops.push({ t: 'hr' }, { t: 'text', s: 'Cash drawer', b: true });
    ops.push({ t: 'row', l: 'Opening cash', r: m(r.openingCash || 0) });
    ops.push({ t: 'row', l: '+ Cash sales', r: m(r.cashSales) });
    ops.push({ t: 'row', l: '− Cash expenses', r: m(r.cashExpenses) });
    ops.push({ t: 'row', l: 'Expected in drawer', r: m(r.expectedCash), b: true });
    if (r.countedCash !== null && r.countedCash !== undefined) {
      ops.push({ t: 'row', l: 'Counted', r: m(r.countedCash) });
      ops.push({ t: 'row', l: 'Difference', r: m(r.countedCash - r.expectedCash), b: true });
    }
    ops.push({ t: 'hr' }, { t: 'text', s: 'Profit (estimate)', b: true });
    ops.push({ t: 'row', l: 'Ingredient cost', r: m(r.cogs) });
    ops.push({ t: 'row', l: 'Gross profit', r: m(r.grossProfit), b: true });
    ops.push({ t: 'row', l: 'Expenses', r: m(r.expenses) });
    ops.push({ t: 'row', l: 'Net profit', r: m(r.netProfit), b: true });
    ops.push({ t: 'hr' }, { t: 'text', s: 'Top items', b: true });
    r.topItems.slice(0, 10).forEach((i) => ops.push({ t: 'row', l: `${i.qty} × ${i.name}`, r: m(i.sales) }));
    if (r.note) ops.push({ t: 'hr' }, { t: 'text', s: `Note: ${r.note}` });
    ops.push({ t: 'hr' }, { t: 'gap', h: 1 }, { t: 'text', s: 'Signature: ______________', a: 'c' });
    return ops;
  }

  /* ---------- canvas renderer (for direct printing) ---------- */
  const loadImg = (src) => new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });

  function wrap(ctx, text, maxW) {
    const out = [];
    String(text).split('\n').forEach((para) => {
      let line = '';
      para.split(/(\s+)/).forEach((word) => {
        if (!word) return;
        const test = line + word;
        if (ctx.measureText(test).width <= maxW || !line.trim()) {
          // a single word longer than the line: break it by characters
          if (ctx.measureText(test).width > maxW && !line.trim()) {
            let chunk = '';
            for (const ch of word) {
              if (ctx.measureText(chunk + ch).width > maxW && chunk) { out.push(chunk); chunk = ''; }
              chunk += ch;
            }
            line = chunk;
          } else line = test;
        } else {
          out.push(line.trimEnd());
          line = word.trimStart();
        }
      });
      out.push(line.trimEnd());
    });
    return out;
  }

  const DOTS_PER_MM = 8; // 203 dpi thermal heads
  const clampMm = (v, d, max) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : d; };
  function margins() {
    const st = Store.settings;
    return { top: clampMm(st.marginTopMm, 5, 30), bottom: clampMm(st.marginBottomMm, 16, 40) };
  }

  async function renderCanvas(ops, dots) {
    const st = Store.settings;
    const mg = margins();
    const base = Math.round((dots / 384) * 22 * ((Number(st.receiptFontPx) || 12) / 12));
    const lh = 1.28;
    const indent = Math.round(base * 0.9);
    const imgs = await Promise.all(ops.map((o) => (o.t === 'img' ? loadImg(o.src) : null)));
    const scratch = document.createElement('canvas').getContext('2d');
    const font = (o) => `${o.b ? 'bold ' : ''}${Math.round(base * (o.z || 1))}px ${FONT}`;
    // small side margin: some print heads clip the outermost dots
    const pad = Math.round(dots * 0.02);
    const inner = dots - pad * 2;

    // pass 1: layout
    const items = [];
    // Blank space is part of the image (exact dots), so it is the same on every print.
    let y = Math.round(mg.top * DOTS_PER_MM);
    ops.forEach((o, k) => {
      const size = Math.round(base * (o.z || 1));
      const x0 = pad + (o.i || 0) * indent;
      if (o.t === 'img') {
        const img = imgs[k];
        if (!img) return;
        const w = Math.round(inner * (o.w || 0.6));
        const h = Math.round(img.naturalHeight * w / img.naturalWidth);
        items.push({ t: 'img', img, x: Math.round((dots - w) / 2), y, w, h });
        y += h + Math.round(base * 0.4);
      } else if (o.t === 'text') {
        scratch.font = font(o);
        wrap(scratch, o.s, dots - pad - x0).forEach((line) => {
          items.push({ t: 'text', s: line, font: font(o), a: o.a, x0, y, size });
          y += Math.round(size * lh);
        });
      } else if (o.t === 'row') {
        scratch.font = font(o);
        const rw = scratch.measureText(o.r).width;
        const lines = wrap(scratch, o.l, dots - pad - x0 - rw - base * 0.6);
        lines.forEach((line, n) => {
          items.push({ t: 'text', s: line, font: font(o), a: 'l', x0, y, size });
          if (n === 0) items.push({ t: 'text', s: o.r, font: font(o), a: 'r', x0, y, size });
          y += Math.round(size * lh);
        });
      } else if (o.t === 'hr') {
        y += Math.round(base * 0.35);
        items.push({ t: 'hr', y });
        y += Math.round(base * 0.5);
      } else if (o.t === 'gap') {
        y += Math.round(base * (o.h || 0.5));
      } else if (o.t === 'tag') {
        const f = `bold ${base}px ${FONT}`;
        scratch.font = f;
        const w = scratch.measureText(o.s).width + base;
        y += 4;
        items.push({ t: 'box', x: Math.round((dots - w) / 2), y, w: Math.round(w), h: Math.round(base * 1.65) });
        items.push({ t: 'text', s: o.s, font: f, a: 'c', x0: 0, y: y + Math.round(base * 0.3), size: base });
        y += Math.round(base * 1.65) + 8;
      }
    });
    const height = Math.ceil(y + Math.max(1, Math.round(mg.bottom * DOTS_PER_MM)));

    // pass 2: draw
    const cv = document.createElement('canvas');
    cv.width = dots;
    cv.height = height;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, dots, height);
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#000';
    ctx.textBaseline = 'top';
    items.forEach((it) => {
      if (it.t === 'img') ctx.drawImage(it.img, it.x, it.y, it.w, it.h);
      else if (it.t === 'hr') {
        for (let x = pad; x < dots - pad; x += 10) ctx.fillRect(x, it.y, Math.min(6, dots - pad - x), 2);
      } else if (it.t === 'box') {
        ctx.lineWidth = 3;
        ctx.strokeRect(it.x + 1.5, it.y + 1.5, it.w - 3, it.h - 3);
      } else {
        ctx.font = it.font;
        if (it.a === 'c') { ctx.textAlign = 'center'; ctx.fillText(it.s, dots / 2, it.y); }
        else if (it.a === 'r') { ctx.textAlign = 'right'; ctx.fillText(it.s, dots - pad, it.y); }
        else { ctx.textAlign = 'left'; ctx.fillText(it.s, it.x0, it.y); }
      }
    });
    return cv;
  }

  /* ---------- ESC/POS ---------- */
  function escpos(canvas, { cut = false, drawer = false, mode = 'raster' } = {}) {
    const W = canvas.width;
    const H = canvas.height;
    const bpr = Math.ceil(W / 8);
    const px = canvas.getContext('2d').getImageData(0, 0, W, H).data;
    const black = (x, y) => {
      const i = (y * W + x) * 4;
      return px[i + 3] > 127 && 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2] < 150;
    };
    const out = [];
    const push = (...b) => b.forEach((x) => out.push(x & 0xff));
    push(0x1b, 0x40); // initialise
    if (drawer) push(0x1b, 0x70, 0x00, 0x19, 0xfa);
    if (mode === 'compat') {
      // ESC * 33: 24-dot column images, supported by practically every ESC/POS printer
      push(0x1b, 0x33, 24); // line spacing = 24 dots
      for (let y0 = 0; y0 < H; y0 += 24) {
        push(0x1b, 0x2a, 33, W & 0xff, W >> 8);
        for (let x = 0; x < W; x++) {
          for (let k = 0; k < 3; k++) {
            let byte = 0;
            for (let bit = 0; bit < 8; bit++) {
              const y = y0 + k * 8 + bit;
              if (y < H && black(x, y)) byte |= 0x80 >> bit;
            }
            out.push(byte);
          }
        }
        // last strip: advance only the rows actually used, so the bottom gap is exact
        const rows = Math.min(24, H - y0);
        if (rows < 24) push(0x1b, 0x33, rows);
        push(0x0a);
      }
      push(0x1b, 0x32); // default line spacing
    }
    const BAND = 128; // small bands: cheap printers have small buffers
    for (let y0 = 0; mode !== 'compat' && y0 < H; y0 += BAND) {
      const rows = Math.min(BAND, H - y0);
      push(0x1d, 0x76, 0x30, 0x00, bpr & 0xff, bpr >> 8, rows & 0xff, rows >> 8);
      for (let y = y0; y < y0 + rows; y++) {
        for (let bx = 0; bx < bpr; bx++) {
          let byte = 0;
          for (let bit = 0; bit < 8; bit++) {
            const x = bx * 8 + bit;
            if (x < W && black(x, y)) byte |= 0x80 >> bit;
          }
          out.push(byte);
        }
      }
    }
    if (cut) push(0x1d, 0x56, 0x42, 0x00); // feed & partial cut (ignored by printers without a cutter)
    return new Uint8Array(out);
  }

  /* ---------- print helper client ---------- */
  async function call(path, { method = 'GET', body = null, timeout = 3000 } = {}) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(HELPER + path, {
        method, body, signal: ctl.signal, cache: 'no-store',
        headers: body ? { 'Content-Type': 'text/plain' } : undefined,
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Print helper error');
      return json;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Print helper did not answer');
      if (e instanceof TypeError) throw new Error('Print helper is not running');
      throw e;
    } finally { clearTimeout(t); }
  }

  const helper = {
    async status(timeout = 2500) {
      try { await call('/health', { timeout }); return true; } catch { return false; }
    },
    printers: (timeout = 4000) => call('/printers', { timeout }),
    async pickPrinter() {
      const st = Store.settings;
      if (st.receiptPrinter) return st.receiptPrinter;
      const { printers, default: def } = await helper.printers();
      const guess = printers.find((p) => /rp58|rp80|rongta|pos-?58|pos-?80|xprinter|thermal|receipt/i.test(p)) || def;
      if (!guess) throw new Error('No printer found — choose one in Settings');
      await Store.saveSettings({ receiptPrinter: guess });
      return guess;
    },
    async send(bytes, doc) {
      const printer = await helper.pickPrinter();
      await call(`/print?printer=${encodeURIComponent(printer)}&doc=${encodeURIComponent(doc)}`, {
        method: 'POST', body: new Blob([bytes], { type: 'text/plain' }), timeout: 20000,
      });
      return printer;
    },
  };

  /* ---------- HTML renderer (browser print dialog fallback) ---------- */
  function html(ops) {
    const st = Store.settings;
    const p = paper();
    const fs = Math.max(9, Math.min(16, Number(st.receiptFontPx) || 12));
    const e = U.esc;
    const style = (o) => `font-size:${(o.z || 1).toFixed(2)}em;${o.b ? 'font-weight:700;' : ''}${o.i ? `padding-left:${o.i * 3}mm;` : ''}`;
    const body = ops.map((o) => {
      if (o.t === 'img') return `<img src="${o.src}" style="width:${Math.round(p.mm * (o.w || 0.6))}mm;margin:0 auto 1.5mm;display:block" alt="">`;
      if (o.t === 'text') return `<div style="${style(o)}text-align:${o.a === 'c' ? 'center' : o.a === 'r' ? 'right' : 'left'}">${e(o.s)}</div>`;
      if (o.t === 'row') return `<div class="row" style="${style(o)}"><span>${e(o.l)}</span><span>${e(o.r)}</span></div>`;
      if (o.t === 'hr') return '<div class="hr"></div>';
      if (o.t === 'gap') return `<div style="height:${o.h || 0.5}em"></div>`;
      if (o.t === 'tag') return `<div style="text-align:center"><span class="tag">${e(o.s)}</span></div>`;
      return '';
    }).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box;margin:0;padding:0}
      html,body{background:#fff;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      body{width:${p.mm}mm;font-family:${FONT};font-size:${fs}px;line-height:1.3}
      #r{width:${p.mm}mm;padding:${margins().top}mm 0 ${margins().bottom}mm}
      .row{display:flex;justify-content:space-between;gap:2mm}.row span:last-child{white-space:nowrap}
      .hr{border-top:1px dashed #000;margin:1.5mm 0}
      .tag{display:inline-block;border:1.5px solid #000;padding:0 2mm;font-weight:700;margin-top:1mm}
    </style></head><body><div id="r">${body}</div></body></html>`;
  }

  /* Direct printing failed: ask instead of opening the big print window on its own. */
  function askFallback(doc, reason) {
    return new Promise((resolve) => {
      let choice = 'skip';
      const md = U.modal({
        title: `🖨 ${doc} did not print`,
        body: `<p><b>${U.esc(reason)}</b></p>
          <p class="muted">Check the printer is switched on, has paper and its USB cable is in, then press <b>Try again</b>.
          If the print helper is not running, close the POS and open it again from the <b>Bubble Blush POS</b> desktop shortcut.</p>
          <p class="muted small">Already printed? Press <b>Skip</b> so it does not print twice.</p>`,
        actions: [
          { label: 'Skip', left: true },
          { label: 'Use print window', onClick: () => { choice = 'window'; } },
          { label: '↻ Try again', cls: 'primary', onClick: () => { choice = 'retry'; } },
        ],
        onClose: () => resolve(choice),
      });
      setTimeout(() => md.el.querySelector('.modal-actions .primary')?.focus(), 50);
    });
  }

  /* ---------- public ---------- */
  async function print(ops, doc) {
    const st = Store.settings;
    const p = paper();
    if (st.printMode !== 'browser') {
      try {
        const cv = await renderCanvas(ops, p.dots);
        const bytes = escpos(cv, { cut: !!st.receiptCut, drawer: !!st.openDrawer && /^Bill/.test(doc), mode: st.imageMode === 'compat' ? 'compat' : 'raster' });
        await helper.send(bytes, doc);
        return { ok: true, direct: true };
      } catch (err) {
        console.warn('Direct print failed', err);
        const choice = await askFallback(doc, err.message || String(err));
        if (choice === 'retry') return print(ops, doc);
        if (choice !== 'window') return { ok: false, direct: false };
      }
    }
    await Print.run(html(ops), { paperWidthMm: p.mm, autoHeight: true });
    return { ok: true, direct: false };
  }

  return {
    paper, margins, receiptOps, kitchenOps, dayReportOps, renderCanvas, escpos, html, helper, print,
    receipt: (order, opts) => print(receiptOps(order, opts), `Bill #${order.no}`),
    kitchen: (order, opts) => print(kitchenOps(order, opts), `Kitchen #${order.no}`),
    dayReport: (r) => print(dayReportOps(r), 'Day report'),
    spacingTest: () => print(spacingTestOps(), 'Spacing test'),
  };
})();
