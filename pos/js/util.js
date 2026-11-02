'use strict';
/* Small helpers shared by every screen. */
const Views = {};

const U = (() => {
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const modals = [];
  const pad = (n) => String(n).padStart(2, '0');

  const U = {
    $: (s, r = document) => r.querySelector(s),
    $$: (s, r = document) => Array.from(r.querySelectorAll(s)),
    esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]),
    uid: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    n: (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; },
    round: (n, d = 2) => { const f = 10 ** d; return Math.round((Number(n) || 0) * f) / f; },
    sum: (arr, fn = (x) => x) => arr.reduce((s, x) => s + (Number(fn(x)) || 0), 0),
    color: (c, fallback = '#A8C3C9') => (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : fallback),

    money(n, dec = 0) {
      const v = Number(n) || 0;
      const s = Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      return (v < 0 ? '-' : '') + '৳' + s;
    },
    qty(n) { return (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }); },
    pct(n, dec = 0) { return (Number.isFinite(n) ? (n * 100).toFixed(dec) : '0') + '%'; },

    dayKey(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; },
    monthKey(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; },
    parseDay(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d || 1); },
    addDays(k, n) { const d = U.parseDay(k); d.setDate(d.getDate() + n); return U.dayKey(d); },
    fmtDay(k) { return U.parseDay(k).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); },
    fmtTime(iso) { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); },
    fmtDateTime(iso) {
      const d = new Date(iso);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' + U.fmtTime(iso);
    },
    stamp(d = new Date()) { return `${U.dayKey(d)}_${pad(d.getHours())}${pad(d.getMinutes())}`; },

    debounce(fn, ms = 300) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },

    /* Segmented control: options are strings or {v, l}. */
    seg(name, options, value) {
      return `<div class="seg" data-seg="${U.esc(name)}">${options.map((o) => {
        const v = typeof o === 'object' ? o.v : o; const l = typeof o === 'object' ? o.l : o;
        return `<button type="button" data-v="${U.esc(v)}" class="${v === value ? 'on' : ''}">${U.esc(l)}</button>`;
      }).join('')}</div>`;
    },
    bindSeg(root, name, onChange) {
      const el = root.querySelector(`[data-seg="${name}"]`);
      if (!el) return;
      el.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-v]');
        if (!b) return;
        el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        onChange(b.dataset.v);
      });
    },

    toast(msg, type = 'ok', ms = 2800) {
      const box = document.getElementById('toasts');
      const t = document.createElement('div');
      t.className = `toast ${type}`;
      t.textContent = msg;
      box.append(t);
      setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
    },

    /* Modal dialog. actions: [{label, cls, onClick(api)}]; onClick returning false keeps it open. */
    modal({ title, body = '', actions = [], wide = false, dismissable = true, onClose } = {}) {
      const ov = document.createElement('div');
      ov.className = 'modal-overlay';
      ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
        <div class="modal-head"><h2>${U.esc(title)}</h2><button type="button" class="icon-btn modal-x" aria-label="Close">✕</button></div>
        <div class="modal-body"></div><div class="modal-actions"></div></div>`;
      const bodyEl = ov.querySelector('.modal-body');
      if (typeof body === 'string') bodyEl.innerHTML = body; else bodyEl.append(body);
      let closed = false;
      const api = {
        el: ov, body: bodyEl, dismissable,
        close() {
          if (closed) return;
          closed = true;
          ov.remove();
          const i = modals.indexOf(api);
          if (i >= 0) modals.splice(i, 1);
          if (onClose) onClose();
        },
      };
      const actEl = ov.querySelector('.modal-actions');
      actions.forEach((a) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn ' + (a.cls || '');
        b.textContent = a.label;
        if (a.left) b.style.marginRight = 'auto';
        b.onclick = async () => {
          if (a.onClick) {
            b.disabled = true;
            let r;
            try { r = await a.onClick(api); } finally { b.disabled = false; }
            if (r === false) return;
          }
          api.close();
        };
        actEl.append(b);
      });
      if (!actions.length) actEl.remove();
      ov.querySelector('.modal-x').onclick = () => api.close();
      ov.addEventListener('mousedown', (e) => { if (e.target === ov && dismissable) api.close(); });
      document.body.append(ov);
      modals.push(api);
      const f = ov.querySelector('[autofocus]');
      if (f) setTimeout(() => f.focus(), 30);
      return api;
    },
    topModal: () => modals[modals.length - 1],

    confirm(message, { title = 'Please confirm', ok = 'Yes', cancel = 'Cancel', danger = false } = {}) {
      return new Promise((resolve) => {
        let result = false;
        U.modal({
          title,
          body: `<div class="confirm-msg">${message}</div>`,
          actions: [{ label: cancel }, { label: ok, cls: danger ? 'danger solid' : 'primary', onClick: () => { result = true; } }],
          onClose: () => resolve(result),
        });
      });
    },

    download(name, content, mime = 'text/plain') {
      const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.append(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    },
    toCSV(rows) {
      return '\ufeff' + rows.map((r) => r.map((v) => {
        const s = String(v ?? '');
        return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',')).join('\r\n');
    },
    readFile(file, asDataUrl = false) {
      return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => rej(r.error);
        if (asDataUrl) r.readAsDataURL(file); else r.readAsText(file);
      });
    },
  };
  return U;
})();
