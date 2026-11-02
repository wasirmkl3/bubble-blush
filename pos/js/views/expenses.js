'use strict';
/* Expenses: rent, salaries, bills… everything that is not an ingredient. */
Views.expenses = (() => {
  const CATS = ['Rent', 'Staff salary', 'Electricity', 'Gas', 'Water', 'Internet & phone', 'Marketing & ads', 'Repairs & maintenance',
    'Equipment', 'Cleaning supplies', 'Transport & delivery', 'Bank / bKash fees', 'Owner drawing', 'Other'];
  let root = null;
  let month = null;

  function render(el) {
    root = el;
    month = month || U.monthKey(U.parseDay(Store.businessDay()));
    const today = Store.businessDay();
    el.innerHTML = `
      <div class="page-head"><h1>Expenses</h1>
        <div class="tools"><input type="month" id="xMonth" value="${month}"><button class="btn ghost" id="xCsv">⬇ CSV</button></div></div>
      <div class="split">
        <div class="card">
          <h3>Add expense</h3>
          <div class="form-grid">
            <div><label>Date</label><input type="date" id="xDay" value="${today}"></div>
            <div><label>Amount ৳</label><input type="number" id="xAmt" min="0" step="any" autofocus></div>
            <div><label>Category</label><select id="xCat">${CATS.map((c) => `<option>${c}</option>`).join('')}</select></div>
            <div><label>Paid by</label><select id="xMethod">${['Cash', 'bKash', 'Nagad', 'Bank', 'Card'].map((m) => `<option>${m}</option>`).join('')}</select></div>
            <div class="span2"><label>Note</label><input type="text" id="xNote" placeholder="e.g. October rent, DESCO bill"></div>
            <div class="span2"><label class="check"><input type="checkbox" id="xDrawer" checked> Taken from today's cash drawer</label></div>
          </div>
          <button class="btn primary mt" id="xAdd">Save expense</button>
          <p class="muted small mt">Ingredient &amp; packaging purchases should be recorded in <b>Inventory → Buy</b> so drink costs stay accurate.</p>
        </div>
        <div class="card"><h3>This month by category</h3><div id="xCats"></div></div>
      </div>
      <div class="card flush mt" id="xList"></div>`;
    const syncDrawer = () => {
      U.$('#xDrawer', el).checked = U.$('#xMethod', el).value === 'Cash' && U.$('#xDay', el).value === Store.businessDay();
    };
    U.$('#xMethod', el).onchange = syncDrawer;
    U.$('#xDay', el).onchange = syncDrawer;
    U.$('#xMonth', el).onchange = (e) => { month = e.target.value || month; load(); };
    U.$('#xAdd', el).onclick = add;
    U.$('#xAmt', el).onkeydown = (e) => { if (e.key === 'Enter') add(); };
    load();
  }

  async function add() {
    const amt = U.n(U.$('#xAmt', root).value);
    if (amt <= 0) { U.toast('Enter an amount', 'err'); return; }
    const day = U.$('#xDay', root).value || Store.businessDay();
    await DB.put('expenses', {
      id: U.uid(), dayKey: day, at: new Date().toISOString(), category: U.$('#xCat', root).value, amount: amt,
      method: U.$('#xMethod', root).value, note: U.$('#xNote', root).value.trim(), fromDrawer: U.$('#xDrawer', root).checked,
    });
    U.toast('Expense saved');
    U.$('#xAmt', root).value = '';
    U.$('#xNote', root).value = '';
    U.$('#xAmt', root).focus();
    month = day.slice(0, 7);
    U.$('#xMonth', root).value = month;
    load();
  }

  async function load() {
    const from = `${month}-01`;
    const to = `${month}-31`;
    const list = (await Store.expensesBetween(from, to)).sort((a, b) => b.dayKey.localeCompare(a.dayKey) || b.at.localeCompare(a.at));
    const byCat = {};
    list.forEach((x) => { byCat[x.category] = (byCat[x.category] || 0) + x.amount; });
    const total = U.sum(list, (x) => x.amount);
    const ops = U.sum(list.filter((x) => !x.isStock), (x) => x.amount);
    const max = Math.max(1, ...Object.values(byCat));
    U.$('#xCats', root).innerHTML = list.length ? `
      ${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<div class="bar-row"><span>${U.esc(c)}</span>
        <div class="bar"><i style="width:${(v / max) * 100}%"></i></div><b>${U.money(v)}</b></div>`).join('')}
      <div class="tot-row grand mt"><span>Total spent</span><span>${U.money(total)}</span></div>
      <div class="tot-row muted"><span>Operating expenses (excl. stock purchases)</span><span>${U.money(ops)}</span></div>`
      : '<p class="muted">No expenses recorded this month.</p>';
    U.$('#xList', root).innerHTML = list.length ? `<table class="tbl"><thead><tr><th>Date</th><th>Category</th><th>Note</th><th>Paid by</th><th class="r">Amount</th><th></th></tr></thead>
      <tbody>${list.map((x) => `<tr><td class="nowrap">${U.fmtDay(x.dayKey)}</td><td>${U.esc(x.category)}${x.isStock ? ' <span class="badge">stock</span>' : ''}</td>
        <td>${U.esc(x.note || '')}</td><td>${U.esc(x.method)}${x.fromDrawer ? ' <small class="muted">(drawer)</small>' : ''}</td>
        <td class="r"><b>${U.money(x.amount)}</b></td><td class="r"><button class="icon-btn" data-del="${x.id}" title="Delete">✕</button></td></tr>`).join('')}</tbody></table>`
      : '';
    U.$('#xList', root).onclick = async (e) => {
      const b = e.target.closest('[data-del]');
      if (!b) return;
      const x = list.find((y) => y.id === b.dataset.del);
      if (await U.confirm(`Delete expense ${U.money(x.amount)} (${U.esc(x.category)})?${x.isStock ? '<br><small>Stock quantity is not changed — fix it in Inventory if needed.</small>' : ''}`, { ok: 'Delete', danger: true })) {
        await DB.del('expenses', x.id);
        load();
      }
    };
    U.$('#xCsv', root).onclick = () => U.download(`expenses-${month}.csv`, U.toCSV([
      ['Date', 'Category', 'Note', 'Paid by', 'From drawer', 'Amount (BDT)'],
      ...list.map((x) => [x.dayKey, x.category, x.note || '', x.method, x.fromDrawer ? 'Yes' : 'No', x.amount]),
    ]), 'text/csv');
  }

  return { render, CATS };
})();
