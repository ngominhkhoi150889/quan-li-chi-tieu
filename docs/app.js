(function () {
  'use strict';

  const STORAGE_KEY = 'so-chi-tieu-v1';
  const MAX_BREAKDOWN_ROWS = 8;

  const moneyFormat = new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  });
  const qtyFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
  const percentFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

  const el = {
    body: document.body,
    form: document.getElementById('entry-form'),
    name: document.getElementById('entry-name'),
    qty: document.getElementById('entry-qty'),
    price: document.getElementById('entry-price'),
    error: document.getElementById('form-error'),
    submit: document.getElementById('submit-btn'),
    clear: document.getElementById('clear-btn'),
    status: document.getElementById('runtime-status'),
    total: document.getElementById('stat-total'),
    caption: document.getElementById('stat-caption'),
    count: document.getElementById('stat-count'),
    totalQty: document.getElementById('stat-qty'),
    average: document.getElementById('stat-average'),
    tableWrap: document.getElementById('table-wrap'),
    tbody: document.getElementById('entries-body'),
    emptyState: document.getElementById('empty-state'),
    listCount: document.getElementById('list-count'),
    breakdownList: document.getElementById('breakdown-list'),
    breakdownEmpty: document.getElementById('breakdown-empty'),
    breakdownCount: document.getElementById('breakdown-count'),
    breakdownSub: document.getElementById('breakdown-sub'),
  };

  let core = null;
  let entries = [];

  function formatMoney(value) {
    return moneyFormat.format(Number.isFinite(value) ? value : 0);
  }

  function formatQty(value) {
    return qtyFormat.format(Number.isFinite(value) ? value : 0);
  }

  function setError(message) {
    el.error.textContent = message || '';
    el.form.classList.toggle('has-error', Boolean(message));
  }

  function setStatus(state, text) {
    el.status.dataset.state = state;
    el.status.textContent = text;
  }

  function toArray(value) {
    return Array.from(value || [], (item) => ({ ...item }));
  }

  function persist() {
    const snapshot = entries.map(({ name, qty, price }) => ({ name, qty, price }));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      console.warn('Không lưu được dữ liệu vào localStorage', error);
    }
  }

  function restore() {
    let saved = [];
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (error) {
      saved = [];
    }
    if (!Array.isArray(saved)) return;

    for (const item of saved) {
      if (!item || typeof item.name !== 'string') continue;
      const qty = Number(item.qty);
      const price = Number(item.price);
      if (!Number.isFinite(qty) || !Number.isFinite(price)) continue;
      core.addEntry(item.name, qty, price);
    }
  }

  function renderRows() {
    el.tbody.textContent = '';
    const fragment = document.createDocumentFragment();

    entries.forEach((entry, index) => {
      const row = document.createElement('tr');

      const indexCell = document.createElement('td');
      indexCell.className = 'col-index';
      indexCell.textContent = String(index + 1);

      const nameCell = document.createElement('td');
      nameCell.className = 'entry-name';
      nameCell.textContent = entry.name;

      const qtyCell = document.createElement('td');
      qtyCell.className = 'num';
      qtyCell.textContent = formatQty(entry.qty);

      const priceCell = document.createElement('td');
      priceCell.className = 'num money';
      priceCell.textContent = formatMoney(entry.price);

      const amountCell = document.createElement('td');
      amountCell.className = 'num money entry-amount';
      amountCell.textContent = formatMoney(entry.amount);

      const actionCell = document.createElement('td');
      actionCell.className = 'col-action';
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'delete-btn';
      deleteButton.dataset.id = String(entry.id);
      deleteButton.setAttribute('aria-label', `Xóa khoản ${entry.name}`);
      deleteButton.title = 'Xóa khoản chi';
      deleteButton.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>';
      actionCell.append(deleteButton);

      row.append(indexCell, nameCell, qtyCell, priceCell, amountCell, actionCell);
      fragment.append(row);
    });

    el.tbody.append(fragment);
  }

  function renderBreakdown(rows, total) {
    el.breakdownList.textContent = '';
    const hasRows = rows.length > 0;
    el.breakdownList.hidden = !hasRows;
    el.breakdownEmpty.hidden = hasRows;
    el.breakdownCount.textContent = `${rows.length} mặt hàng`;

    if (!hasRows) {
      el.breakdownSub.textContent = 'Các khoản trùng tên được gộp lại.';
      return;
    }

    const top = rows[0];
    el.breakdownSub.textContent = `Chi nhiều nhất: ${top.name} · ${formatMoney(top.amount)}`;

    const maxAmount = top.amount;
    const fragment = document.createDocumentFragment();

    rows.slice(0, MAX_BREAKDOWN_ROWS).forEach((row) => {
      const share = total > 0 ? (row.amount / total) * 100 : 0;
      const width = maxAmount > 0 ? (row.amount / maxAmount) * 100 : 0;

      const item = document.createElement('li');
      item.className = 'breakdown-item';

      const head = document.createElement('div');
      head.className = 'breakdown-head';

      const name = document.createElement('span');
      name.className = 'breakdown-name';
      name.textContent = row.name;

      const amount = document.createElement('span');
      amount.className = 'breakdown-amount';
      amount.textContent = formatMoney(row.amount);

      head.append(name, amount);

      const bar = document.createElement('div');
      bar.className = 'bar';
      const fill = document.createElement('span');
      fill.style.width = `${width}%`;
      bar.append(fill);

      const meta = document.createElement('p');
      meta.className = 'breakdown-meta';
      meta.textContent = `${row.count} lần nhập · SL ${formatQty(row.qty)} · ${percentFormat.format(share)}% tổng tiền`;

      item.append(head, bar, meta);
      fragment.append(item);
    });

    if (rows.length > MAX_BREAKDOWN_ROWS) {
      const more = document.createElement('li');
      more.className = 'breakdown-more';
      more.textContent = `… và ${rows.length - MAX_BREAKDOWN_ROWS} mặt hàng khác`;
      fragment.append(more);
    }

    el.breakdownList.append(fragment);
  }

  function render() {
    entries = toArray(core.getEntries());
    const stats = core.getStats();
    const breakdown = toArray(core.getBreakdown());

    el.total.textContent = formatMoney(stats.total);
    el.count.textContent = String(stats.count);
    el.totalQty.textContent = formatQty(stats.totalQty);
    el.average.textContent = formatMoney(stats.average);
    el.caption.textContent =
      stats.count === 0
        ? 'Chưa có khoản nào'
        : `Lớn nhất: ${stats.maxName || '—'} · ${formatMoney(stats.maxAmount)}`;
    el.caption.title = el.caption.textContent;

    el.listCount.textContent = `${stats.count} khoản`;
    el.emptyState.hidden = entries.length > 0;
    el.tableWrap.hidden = entries.length === 0;
    el.clear.disabled = entries.length === 0;

    renderRows();
    renderBreakdown(breakdown, stats.total);
    persist();
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!core) return;

    const name = el.name.value.trim();
    const qty = Number(el.qty.value);
    const price = el.price.value.trim() === '' ? NaN : Number(el.price.value);

    if (!name) {
      setError('Vui lòng nhập tên khoản chi.');
      el.name.focus();
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Số lượng phải là số lớn hơn 0.');
      el.qty.focus();
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError('Đơn giá phải là số không âm.');
      el.price.focus();
      return;
    }

    const id = core.addEntry(name, qty, price);
    if (id < 0) {
      setError('Dữ liệu không hợp lệ, vui lòng kiểm tra lại.');
      return;
    }

    setError('');
    el.name.value = '';
    el.qty.value = '1';
    el.price.value = '';
    el.name.focus();
    render();
  }

  function failLoad(error) {
    console.error(error);
    el.body.classList.remove('is-loading');
    setStatus('error', 'Không tải được WebAssembly');
    setError('Không thể khởi động bộ xử lý C++/WebAssembly. Hãy mở ứng dụng qua HTTP server (xem README).');
  }

  function boot() {
    if (typeof createExpenseCore !== 'function') {
      failLoad(new Error('Không tìm thấy core.js (bản build WebAssembly).'));
      return;
    }

    createExpenseCore()
      .then((instance) => {
        core = instance;
        restore();
        render();
        el.submit.disabled = false;
        el.body.classList.remove('is-loading');
        setStatus('ready', `Bộ xử lý C++ v${core.coreVersion()} đã sẵn sàng`);
        el.name.focus();
      })
      .catch(failLoad);
  }

  el.form.addEventListener('submit', handleSubmit);

  el.tbody.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-id]');
    if (!button || !core) return;
    core.removeEntry(Number(button.dataset.id));
    render();
  });

  el.clear.addEventListener('click', () => {
    if (!core || entries.length === 0) return;
    if (!window.confirm(`Xóa toàn bộ ${entries.length} khoản chi đã nhập?`)) return;
    core.clearEntries();
    render();
    el.name.focus();
  });

  boot();
})();
