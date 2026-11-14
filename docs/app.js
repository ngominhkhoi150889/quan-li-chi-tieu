(function () {
  'use strict';

  const DEFAULT_CONFIG = { owner: 'ngominhkhoi150889', repo: 'quan-li-data', token: '' };
  const config = Object.assign({}, DEFAULT_CONFIG);

  const TOKEN_STORAGE_KEY = 'so-chi-tieu-token-v1';
  const CACHE_KEY = 'so-chi-tieu-cache-v2';
  const MAX_DESCRIPTION = 500;
  const PAGE_SIZE = 100;
  const MAX_PAGES = 3;
  const MAX_BREAKDOWN_ROWS = 8;
  const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
  const STALE_AFTER_MS = 60 * 1000;
  const TOKEN_PATTERN = /^(github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,})$/;

  const moneyFormat = new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  });
  const qtyFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
  const percentFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
  const timeFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  const clockFormat = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' });

  const el = {
    body: document.body,
    form: document.getElementById('entry-form'),
    name: document.getElementById('entry-name'),
    desc: document.getElementById('entry-desc'),
    qty: document.getElementById('entry-qty'),
    price: document.getElementById('entry-price'),
    error: document.getElementById('form-error'),
    notice: document.getElementById('form-notice'),
    submit: document.getElementById('submit-btn'),
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
    listSub: document.getElementById('list-sub'),
    listError: document.getElementById('list-error'),
    listErrorText: document.getElementById('list-error-text'),
    retry: document.getElementById('retry-btn'),
    refresh: document.getElementById('refresh-btn'),
    breakdownList: document.getElementById('breakdown-list'),
    breakdownEmpty: document.getElementById('breakdown-empty'),
    breakdownCount: document.getElementById('breakdown-count'),
    breakdownSub: document.getElementById('breakdown-sub'),
    writeBanner: document.getElementById('write-banner'),
    writeBannerText: document.getElementById('write-banner-text'),
    tokenToggle: document.getElementById('token-toggle'),
    tokenForm: document.getElementById('token-form'),
    tokenInput: document.getElementById('token-input'),
    tokenSave: document.getElementById('token-save'),
    tokenError: document.getElementById('token-error'),
    tokenRemove: document.getElementById('token-remove'),
  };

  let core = null;
  let entries = [];
  let sharedToken = '';
  let token = '';
  let truncated = false;
  let lastLoadedAt = 0;
  let loading = false;
  let submitting = false;
  let pendingRetry = null;
  let noticeTimer = 0;
  let refreshTimer = 0;

  class LedgerError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'LedgerError';
      this.code = code;
    }
  }

  function apiUrl() {
    return `https://api.github.com/repos/${config.owner}/${config.repo}`;
  }

  function repositoryUrl() {
    return `https://github.com/${config.owner}/${config.repo}`;
  }

  function formatMoney(value) {
    return moneyFormat.format(Number.isFinite(value) ? value : 0);
  }

  function formatQty(value) {
    return qtyFormat.format(Number.isFinite(value) ? value : 0);
  }

  function typeText(value, max) {
    if (typeof value !== 'string') return '';
    return value.replace(/\r\n/g, '\n').trim().slice(0, max);
  }

  function toArray(value) {
    return Array.from(value || [], (item) => ({ ...item }));
  }

  function setError(message) {
    el.error.textContent = message || '';
  }

  function setNotice(message, tone) {
    clearTimeout(noticeTimer);
    el.notice.textContent = message || '';
    el.notice.dataset.tone = tone || 'success';
    el.notice.hidden = !message;
    if (message) {
      noticeTimer = setTimeout(() => {
        el.notice.hidden = true;
      }, 8000);
    }
  }

  function setStatus(state, text) {
    el.status.dataset.state = state;
    el.status.textContent = text;
  }

  function setListSub() {
    if (!lastLoadedAt) {
      el.listSub.textContent = 'Mỗi dòng là một khoản chi dùng chung trên GitHub.';
      return;
    }
    const parts = [`Đã cập nhật ${clockFormat.format(new Date(lastLoadedAt))}`, 'dữ liệu chung trên GitHub'];
    if (truncated) parts.push(`${PAGE_SIZE * MAX_PAGES} khoản mới nhất`);
    el.listSub.textContent = parts.join(' · ');
  }

  function updateWriteState() {
    const canWrite = Boolean(token);
    el.writeBanner.hidden = canWrite;
    el.tokenRemove.hidden = !token || Boolean(sharedToken);
    el.submit.disabled = !canWrite || !core || submitting;
    el.submit.title = canWrite ? '' : 'Cần token GitHub có quyền Issues trên kho dữ liệu để thêm khoản chi';
    if (!canWrite) {
      el.tokenForm.hidden = true;
      el.tokenToggle.setAttribute('aria-expanded', 'false');
    }
  }

  function messageFor(error) {
    if (error instanceof LedgerError) return error.message;
    console.error(error);
    return 'Đã xảy ra lỗi không mong muốn, vui lòng thử lại.';
  }

  async function parseJson(response) {
    try {
      return await response.json();
    } catch (error) {
      throw new LedgerError('server', 'GitHub trả về dữ liệu không đọc được.');
    }
  }

  async function githubRequest(url, options) {
    const headers = Object.assign(
      { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      options && options.headers,
    );
    if (token) headers.Authorization = `Bearer ${token}`;

    let response;
    try {
      response = await fetch(url, Object.assign({}, options, { headers }));
    } catch (error) {
      throw new LedgerError('network', 'Không kết nối được tới GitHub.');
    }

    if (response.ok) return response;

    const remaining = response.headers.get('x-ratelimit-remaining');
    if (response.status === 401) {
      throw new LedgerError('unauthorized', 'Token GitHub không hợp lệ hoặc đã hết hạn.');
    }
    if (response.status === 404) {
      throw new LedgerError('not_found', 'Không tìm thấy kho dữ liệu GitHub.');
    }
    if (response.status === 410) {
      throw new LedgerError('issues_disabled', 'Kho dữ liệu đã tắt tính năng Issues.');
    }
    if (response.status === 429 || (response.status === 403 && remaining === '0')) {
      throw new LedgerError('rate_limit', 'GitHub tạm giới hạn truy cập, vui lòng thử lại sau ít phút.');
    }
    if (response.status === 403) {
      throw new LedgerError('forbidden', 'Token không có quyền ghi Issues trên kho dữ liệu.');
    }
    if (response.status === 422) {
      throw new LedgerError('rejected', 'GitHub từ chối dữ liệu gửi lên.');
    }
    if (response.status >= 500) {
      throw new LedgerError('server', 'GitHub đang gặp sự cố, vui lòng thử lại.');
    }
    throw new LedgerError('http', `GitHub trả về lỗi ${response.status}.`);
  }

  function encodeMarker(data) {
    const bytes = new TextEncoder().encode(JSON.stringify(Object.assign({ v: 1 }, data)));
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return `<!--ledger:${btoa(binary)}-->`;
  }

  function decodeMarker(body) {
    const match = /<!--ledger:([A-Za-z0-9+/=]+)-->/.exec(body);
    if (!match) return null;
    try {
      const binary = atob(match[1]);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const data = JSON.parse(new TextDecoder().decode(bytes));
      return data && data.v === 1 ? data : null;
    } catch (error) {
      return null;
    }
  }

  function toEntry(issue) {
    const body = typeof issue.body === 'string' ? issue.body : '';
    const marker = decodeMarker(body);
    const description =
      marker && typeof marker.description === 'string' ? marker.description : body.replace(/<!--ledger:[A-Za-z0-9+/=]+-->/, '');
    const qty = marker ? Number(marker.qty) : 1;
    const price = marker ? Number(marker.price) : 0;

    return {
      id: `gh-${issue.number}`,
      number: issue.number,
      clientKey: marker && typeof marker.clientKey === 'string' ? marker.clientKey : '',
      name: typeText(issue.title, 120) || 'Không tên',
      description: typeText(description, MAX_DESCRIPTION),
      qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
      price: Number.isFinite(price) && price >= 0 ? price : 0,
      createdAt: typeof issue.created_at === 'string' ? issue.created_at : '',
      url: typeof issue.html_url === 'string' ? issue.html_url : repositoryUrl(),
    };
  }

  async function fetchIssues() {
    const issues = [];
    let capped = false;

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const url =
        `${apiUrl()}/issues?state=open&sort=created&direction=desc` +
        `&per_page=${PAGE_SIZE}&page=${page}`;
      const batch = await parseJson(await githubRequest(url));
      if (!Array.isArray(batch)) {
        throw new LedgerError('server', 'GitHub trả về dữ liệu không hợp lệ.');
      }
      batch.forEach((issue) => {
        if (issue && typeof issue.number === 'number' && !issue.pull_request) issues.push(issue);
      });
      if (batch.length < PAGE_SIZE) break;
      if (page === MAX_PAGES) capped = true;
    }

    return { issues, truncated: capped };
  }

  async function createIssue(draft) {
    const marker = encodeMarker({
      clientKey: draft.clientKey,
      qty: draft.qty,
      price: draft.price,
      description: draft.description,
    });
    const body = draft.description ? `${draft.description}\n\n${marker}` : marker;

    const response = await githubRequest(`${apiUrl()}/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: draft.name, body }),
    });
    const issue = await parseJson(response);
    if (!issue || typeof issue.number !== 'number') {
      throw new LedgerError('server', 'GitHub trả về dữ liệu không hợp lệ.');
    }
    return issue;
  }

  function readStoredToken() {
    try {
      const saved = (localStorage.getItem(TOKEN_STORAGE_KEY) || '').trim();
      return TOKEN_PATTERN.test(saved) ? saved : '';
    } catch (error) {
      return '';
    }
  }

  function readCache() {
    try {
      const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      const items = raw && Array.isArray(raw.entries) ? raw.entries : [];
      const cached = items
        .filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string')
        .map((item) => ({
          id: item.id,
          number: Number(item.number) || 0,
          clientKey: typeof item.clientKey === 'string' ? item.clientKey : '',
          name: typeText(item.name, 120),
          description: typeText(item.description, MAX_DESCRIPTION),
          qty: Number(item.qty) > 0 ? Number(item.qty) : 1,
          price: Number(item.price) >= 0 ? Number(item.price) : 0,
          createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
          url: typeof item.url === 'string' ? item.url : repositoryUrl(),
        }));
      return { entries: cached, savedAt: Number(raw && raw.savedAt) || 0 };
    } catch (error) {
      return { entries: [], savedAt: 0 };
    }
  }

  function persistCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: lastLoadedAt, entries }));
    } catch (error) {
      /* trình duyệt chặn localStorage thì bỏ qua */
    }
  }

  function formatTime(iso) {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '' : timeFormat.format(date);
  }

  function renderRows(list, metaById) {
    el.tbody.textContent = '';
    const fragment = document.createDocumentFragment();

    list.forEach((item, index) => {
      const meta = metaById.get(item.id) || {};
      const row = document.createElement('tr');

      const indexCell = document.createElement('td');
      indexCell.className = 'col-index';
      indexCell.textContent = String(index + 1);

      const infoCell = document.createElement('td');
      infoCell.className = 'entry-cell';

      const title = document.createElement('span');
      title.className = 'entry-title';
      title.textContent = item.name;
      infoCell.append(title);

      if (item.description) {
        const description = document.createElement('span');
        description.className = 'entry-desc';
        description.textContent = item.description;
        infoCell.append(description);
      }

      const link = document.createElement('a');
      link.className = 'entry-meta';
      link.href = meta.url || repositoryUrl();
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = formatTime(meta.createdAt) || 'Xem trên GitHub';
      infoCell.append(link);

      const qtyCell = document.createElement('td');
      qtyCell.className = 'num';
      qtyCell.dataset.label = 'SL';
      qtyCell.textContent = formatQty(item.qty);

      const priceCell = document.createElement('td');
      priceCell.className = 'num money';
      priceCell.dataset.label = 'Đơn giá';
      priceCell.textContent = formatMoney(item.price);

      const amountCell = document.createElement('td');
      amountCell.className = 'num money entry-amount';
      amountCell.dataset.label = 'Thành tiền';
      amountCell.textContent = formatMoney(item.amount);

      row.append(indexCell, infoCell, qtyCell, priceCell, amountCell);
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
    if (!core) return;

    core.clearEntries();
    entries.forEach((entry) => {
      core.addEntry(entry.id, entry.name, entry.description, entry.qty, entry.price);
    });

    const list = toArray(core.getEntries());
    const stats = core.getStats();
    const metaById = new Map(entries.map((entry) => [entry.id, entry]));

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
    el.emptyState.hidden = list.length > 0;
    el.tableWrap.hidden = list.length === 0;

    renderRows(list, metaById);
    renderBreakdown(toArray(core.getBreakdown()), stats.total);
  }

  function showLoadError(error) {
    let message = messageFor(error);
    if (entries.length) message += ' Đang hiển thị bản lưu gần nhất.';
    if (error && error.code === 'unauthorized' && token && !sharedToken) {
      message += ' Kiểm tra hoặc xóa token của bạn ở cột bên trái.';
    }
    el.listErrorText.textContent = message;
    el.listError.hidden = false;
  }

  async function loadEntries() {
    if (loading || !core) return;
    loading = true;
    el.refresh.disabled = true;
    el.refresh.classList.add('is-busy');

    try {
      const result = await fetchIssues();
      entries = result.issues.map(toEntry);
      truncated = result.truncated;
      lastLoadedAt = Date.now();
      persistCache();
      el.listError.hidden = true;
      render();
      setListSub();
    } catch (error) {
      showLoadError(error);
    } finally {
      loading = false;
      el.refresh.disabled = false;
      el.refresh.classList.remove('is-busy');
    }
  }

  function resetForm() {
    el.name.value = '';
    el.desc.value = '';
    el.qty.value = '1';
    el.price.value = '';
    el.name.focus();
  }

  function createClientKey() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `k-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!core || !token || submitting) return;

    const name = el.name.value.trim();
    const description = el.desc.value.trim();
    const qty = Number(el.qty.value);
    const price = el.price.value.trim() === '' ? NaN : Number(el.price.value);

    if (!name) {
      setError('Vui lòng nhập tên khoản chi.');
      el.name.focus();
      return;
    }
    if (description.length > MAX_DESCRIPTION) {
      setError(`Mô tả tối đa ${MAX_DESCRIPTION} ký tự.`);
      el.desc.focus();
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

    const draft = { name, description, qty, price };
    const fingerprint = JSON.stringify(draft);
    const reuseKey = pendingRetry && pendingRetry.fingerprint === fingerprint ? pendingRetry.key : '';
    const clientKey = reuseKey || createClientKey();

    setError('');
    setNotice('');
    submitting = true;
    el.submit.classList.add('is-busy');
    updateWriteState();

    try {
      if (reuseKey) {
        // Lần gửi trước chưa rõ kết quả: đối chiếu với GitHub trước khi tạo bản ghi mới.
        const result = await fetchIssues();
        entries = result.issues.map(toEntry);
        truncated = result.truncated;
        lastLoadedAt = Date.now();
        persistCache();
        render();
        setListSub();
        el.listError.hidden = true;

        const landed = entries.find((entry) => entry.clientKey === clientKey);
        if (landed) {
          pendingRetry = null;
          resetForm();
          setNotice(`"${landed.name}" đã được ghi nhận trước đó.`, 'success');
          return;
        }
      }

      const entry = toEntry(await createIssue(Object.assign({ clientKey }, draft)));
      entries = [entry, ...entries.filter((item) => item.id !== entry.id)];
      lastLoadedAt = Date.now();
      persistCache();
      pendingRetry = null;
      render();
      setListSub();
      resetForm();
      setNotice(`Đã thêm "${entry.name}" vào sổ chung.`, 'success');
    } catch (error) {
      if (error && (error.code === 'network' || error.code === 'server' || error.code === 'http')) {
        pendingRetry = { key: clientKey, fingerprint };
        setError('Chưa rõ kết quả gửi lên GitHub. Bấm "Thêm khoản chi" lần nữa để kiểm tra trước khi ghi lại.');
      } else {
        pendingRetry = null;
        setError(messageFor(error));
      }
    } finally {
      submitting = false;
      el.submit.classList.remove('is-busy');
      updateWriteState();
    }
  }

  async function loadConfig() {
    try {
      const response = await fetch('config.json', { cache: 'no-store' });
      if (!response.ok) return {};
      const data = await response.json();
      return data && typeof data === 'object' ? data : {};
    } catch (error) {
      return {};
    }
  }

  function applyConfig(remoteConfig) {
    if (typeof remoteConfig.owner === 'string' && remoteConfig.owner.trim()) {
      config.owner = remoteConfig.owner.trim();
    }
    if (typeof remoteConfig.repo === 'string' && remoteConfig.repo.trim()) {
      config.repo = remoteConfig.repo.trim();
    }
    if (typeof remoteConfig.token === 'string') {
      sharedToken = remoteConfig.token.trim();
    }
    token = sharedToken || readStoredToken();
  }

  function startRefreshing() {
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (!document.hidden) loadEntries();
    }, REFRESH_INTERVAL_MS);
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

    Promise.all([loadConfig(), createExpenseCore()])
      .then(([remoteConfig, instance]) => {
        applyConfig(remoteConfig);
        core = instance;

        const cache = readCache();
        entries = cache.entries;
        lastLoadedAt = cache.savedAt;
        render();
        setListSub();
        updateWriteState();

        el.body.classList.remove('is-loading');
        setStatus('ready', `Bộ xử lý C++ v${core.coreVersion()} đã sẵn sàng`);
        startRefreshing();
        loadEntries();
      })
      .catch(failLoad);
  }

  el.form.addEventListener('submit', handleSubmit);
  el.refresh.addEventListener('click', loadEntries);
  el.retry.addEventListener('click', loadEntries);

  el.tokenToggle.addEventListener('click', () => {
    const open = el.tokenForm.hidden;
    el.tokenForm.hidden = !open;
    el.tokenToggle.setAttribute('aria-expanded', String(open));
    if (open) el.tokenInput.focus();
  });

  el.tokenForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = el.tokenInput.value.trim();
    if (!TOKEN_PATTERN.test(value)) {
      el.tokenError.textContent = 'Token không đúng định dạng. Dán token GitHub bắt đầu bằng github_pat_ hoặc ghp_.';
      el.tokenInput.focus();
      return;
    }
    el.tokenError.textContent = '';
    el.tokenInput.value = '';
    token = value;
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, value);
    } catch (error) {
      /* bỏ qua */
    }
    updateWriteState();
    setNotice('Đã bật quyền thêm bằng token của bạn.', 'success');
    loadEntries();
  });

  el.tokenRemove.addEventListener('click', () => {
    token = sharedToken;
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch (error) {
      /* bỏ qua */
    }
    updateWriteState();
    setNotice('Đã xóa token khỏi trình duyệt này.', 'success');
    loadEntries();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !core) return;
    if (Date.now() - lastLoadedAt < STALE_AFTER_MS) return;
    loadEntries();
  });

  boot();
})();
