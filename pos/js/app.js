'use strict';
/* App shell: navigation, manager PIN, banners, boot. */
const App = (() => {
  const NAV = [
    { id: 'pos', label: 'Sell', icon: '🧋', key: 'F2' },
    { id: 'orders', label: 'Orders', icon: '🧾', key: 'F3' },
    { id: 'inventory', label: 'Inventory', icon: '📦', key: 'F4' },
    { id: 'menu', label: 'Menu & Pricing', icon: '📋', key: 'F6', locked: true },
    { id: 'expenses', label: 'Expenses', icon: '💸', key: 'F7', locked: true },
    { id: 'reports', label: 'Reports', icon: '📈', key: 'F8', locked: true },
    { id: 'settings', label: 'Settings', icon: '⚙️', key: 'F9', locked: true },
  ];
  let current = null;
  let unlockedUntil = 0;
  let helperOk = null; // null = not checked yet
  const UNLOCK_MS = 15 * 60 * 1000;

  function renderNav() {
    const nav = U.$('#nav');
    nav.innerHTML = NAV.map((n) => `<button type="button" data-view="${n.id}" title="${n.label} (${n.key})">
      <span class="ni">${n.icon}</span><span class="nl">${n.label}</span></button>`).join('');
    nav.addEventListener('click', (e) => {
      const b = e.target.closest('[data-view]');
      if (b) go(b.dataset.view);
    });
  }

  function isUnlocked() { return !Store.settings.pin || Date.now() < unlockedUntil; }

  function requirePin(reason = 'This area is for the owner/manager.') {
    if (isUnlocked()) { unlockedUntil = Date.now() + UNLOCK_MS; updateLock(); return Promise.resolve(true); }
    return new Promise((resolve) => {
      let ok = false;
      const md = U.modal({
        title: '🔒 Manager PIN',
        body: `<p class="muted">${U.esc(reason)}</p>
          <input type="password" inputmode="numeric" class="pin-input" id="pinIn" autocomplete="off" autofocus placeholder="••••">
          <div class="err" id="pinErr"></div>`,
        actions: [{ label: 'Cancel' }, {
          label: 'Unlock', cls: 'primary', onClick: () => check(),
        }],
        onClose: () => resolve(ok),
      });
      const input = U.$('#pinIn', md.el);
      function check() {
        if (input.value === String(Store.settings.pin)) {
          ok = true;
          unlockedUntil = Date.now() + UNLOCK_MS;
          updateLock();
          return true;
        }
        U.$('#pinErr', md.el).textContent = 'Wrong PIN';
        input.select();
        return false;
      }
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && check()) md.close(); });
    });
  }

  function updateLock() {
    const b = U.$('#lockBtn');
    if (!Store.settings.pin) { b.hidden = true; return; }
    b.hidden = false;
    const open = Date.now() < unlockedUntil;
    b.textContent = open ? '🔓 Lock' : '🔒';
    b.title = open ? 'Lock manager areas now' : 'Manager areas are locked';
  }

  async function go(id, { force = false } = {}) {
    const view = Views[id];
    const nav = NAV.find((n) => n.id === id);
    if (!view || !nav) return go('pos');
    if (nav.locked && !force && !(await requirePin(`"${nav.label}" is protected by the manager PIN.`))) return;
    if (current && Views[current].hide) Views[current].hide();
    current = id;
    if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
    U.$$('#nav [data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === id));
    const el = U.$('#view');
    el.className = `view view-${id}`;
    el.innerHTML = '';
    try {
      await view.render(el);
    } catch (err) {
      console.error(err);
      el.innerHTML = `<div class="card"><h2>Something went wrong</h2><pre>${U.esc(err.stack || err)}</pre></div>`;
    }
    banners();
  }

  function banners() {
    const st = Store.settings;
    const box = U.$('#banner');
    const msgs = [];
    const params = new URLSearchParams(location.search);
    if (location.protocol === 'file:' && !params.has('launcher') && !sessionStorage.getItem('hideLauncherTip')) {
      msgs.push(`<div class="banner info" data-k="launcher">💡 Tip: open the POS with <b>“Start Bubble Blush POS”</b> so your data always stays in the same safe place.
        <button class="btn sm ghost" data-close="launcher">Got it</button></div>`);
    }
    if (st.printMode !== 'browser' && helperOk === false && !sessionStorage.getItem('hideHelper')) {
      msgs.push(`<div class="banner low" data-k="helper">🖨 Print helper is not running, so bills will open the print window.
        Close the POS and open it with the <b>Bubble Blush POS</b> desktop shortcut.
        <button class="btn sm ghost" data-act="recheck">Check again</button><button class="btn sm ghost" data-close="helper">Hide</button></div>`);
    }
    const last = st.lastBackupAt ? new Date(st.lastBackupAt).getTime() : 0;
    if (Date.now() - last > 24 * 3600 * 1000 && !sessionStorage.getItem('hideBackup')) {
      msgs.push(`<div class="banner warn" data-k="backup">💾 ${last ? 'Last backup was ' + U.fmtDateTime(st.lastBackupAt) : 'No backup yet'} — keep a copy of your sales data safe.
        <button class="btn sm primary" data-act="backup">Backup now</button><button class="btn sm ghost" data-close="backup">Later</button></div>`);
    }
    const low = Store.lowStock();
    if (low.length && current !== 'inventory') {
      msgs.push(`<div class="banner low" data-k="low">📦 ${low.length} ingredient${low.length > 1 ? 's are' : ' is'} running low: ${low.slice(0, 4).map((i) => U.esc(i.name)).join(', ')}${low.length > 4 ? '…' : ''}
        <button class="btn sm ghost" data-act="inventory">View</button></div>`);
    }
    box.innerHTML = msgs.join('');
  }

  async function backupNow() {
    const data = await Store.exportAll();
    U.download(`BubbleBlush-backup-${U.stamp()}.json`, JSON.stringify(data), 'application/json');
    await Store.saveSettings({ lastBackupAt: new Date().toISOString() });
    U.toast('Backup saved to your Downloads folder');
    banners();
  }

  function tick() {
    const d = new Date();
    U.$('#clock').textContent = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    updateLock();
  }

  function applyBrand() {
    const st = Store.settings;
    document.title = `${st.shopName} POS`;
    U.$('#brandName').textContent = st.shopName;
  }

  async function boot() {
    try {
      await Store.init();
    } catch (err) {
      U.$('#view').innerHTML = `<div class="card"><h2>Could not open the POS database</h2><p>${U.esc(err.message || err)}</p></div>`;
      return;
    }
    // Ask the browser never to auto-delete our data when disk space is low.
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    renderNav();
    applyBrand();
    tick();
    setInterval(tick, 15000);
    Store.onChange((w) => { if (w === 'settings' || w === 'all') { applyBrand(); updateLock(); } });

    U.$('#banner').addEventListener('click', (e) => {
      const c = e.target.closest('[data-close]');
      if (c) {
        sessionStorage.setItem({ backup: 'hideBackup', helper: 'hideHelper' }[c.dataset.close] || 'hideLauncherTip', '1');
        banners();
      }
      const a = e.target.closest('[data-act]');
      if (a && a.dataset.act === 'backup') backupNow();
      if (a && a.dataset.act === 'inventory') go('inventory');
      if (a && a.dataset.act === 'recheck') checkHelper();
    });
    U.$('#lockBtn').addEventListener('click', () => {
      if (Date.now() < unlockedUntil) {
        unlockedUntil = 0;
        updateLock();
        U.toast('Manager areas locked');
        const nav = NAV.find((n) => n.id === current);
        if (nav && nav.locked) go('pos');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const t = U.topModal();
        if (t && t.dismissable) { t.close(); e.preventDefault(); }
        return;
      }
      const n = NAV.find((x) => x.key === e.key);
      if (n && !U.topModal()) { e.preventDefault(); go(n.id); }
    });
    window.addEventListener('hashchange', () => {
      const id = location.hash.slice(1);
      if (id && id !== current) go(id);
    });

    const start = location.hash.slice(1);
    const startNav = NAV.find((n) => n.id === start);
    go(startNav && !startNav.locked ? start : 'pos');
    checkHelper();
  }

  /* Ask the print helper once at start-up (any Edge permission prompt appears now, not at the counter). */
  async function checkHelper() {
    if (Store.settings.printMode === 'browser') return;
    helperOk = await Receipt.helper.status(10000);
    if (!helperOk) {
      // the helper may still be starting: try again shortly
      await new Promise((r) => setTimeout(r, 4000));
      helperOk = await Receipt.helper.status(6000);
    }
    banners();
  }

  return { boot, go, requirePin, backupNow, banners, get current() { return current; } };
})();

document.addEventListener('DOMContentLoaded', App.boot);
