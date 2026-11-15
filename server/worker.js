const GITHUB_API = 'https://api.github.com';
const LEDGER_PATH = '/contents/ledger.json';
const MAX_BODY_BYTES = 4096;
const MAX_WRITE_ATTEMPTS = 4;
const MAX_ENTRIES = 20000;

const emptyDocument = () => ({ v: 1, updatedAt: '', entries: [] });

function corsHeaders(origin) {
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  return headers;
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, corsHeaders(origin)),
  });
}

function preflight(origin) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    },
  });
}

function resolveOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return '';
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeBase64(value) {
  const binary = atob(String(value || '').replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function sanitizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 120) : '';
  const description = typeof raw.description === 'string' ? raw.description.trim().slice(0, 500) : '';
  const qty = Number(raw.qty);
  const price = Number(raw.price);
  if (!id || id.length > 64 || !name) return null;
  if (!Number.isFinite(qty) || qty <= 0) return null;
  if (!Number.isFinite(price) || price < 0) return null;
  return {
    id,
    name,
    description,
    qty,
    price,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
  };
}

function normalizeDocument(raw) {
  const seen = new Set();
  const entries = [];
  if (raw && Array.isArray(raw.entries)) {
    raw.entries.forEach((item) => {
      const entry = sanitizeEntry(item);
      if (entry && !seen.has(entry.id)) {
        seen.add(entry.id);
        entries.push(entry);
      }
    });
  }
  return {
    v: 1,
    updatedAt: raw && typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
    entries,
  };
}

function validateDraft(payload) {
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const description = typeof payload.description === 'string' ? payload.description.trim() : '';
  const qty = Number(payload.qty);
  const price = Number(payload.price);

  if (!name || name.length > 120) return { error: 'Tên khoản chi phải từ 1 đến 120 ký tự.' };
  if (description.length > 500) return { error: 'Mô tả tối đa 500 ký tự.' };
  if (!Number.isFinite(qty) || qty <= 0 || qty > 1e9) return { error: 'Số lượng phải là số lớn hơn 0.' };
  if (!Number.isFinite(price) || price < 0 || price > 1e12) return { error: 'Đơn giá phải là số không âm.' };

  return { name, description, qty, price };
}

function githubRequest(env, path, options) {
  return fetch(`${GITHUB_API}/repos/${env.LEDGER_OWNER}/${env.LEDGER_REPO}${path}`, Object.assign({}, options, {
    headers: Object.assign(
      {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        'User-Agent': 'quan-li-ledger-worker',
      },
      options && options.headers,
    ),
  }));
}

async function readDocument(env) {
  const ref = encodeURIComponent(env.LEDGER_BRANCH || 'main');
  const response = await githubRequest(env, `${LEDGER_PATH}?ref=${ref}`);
  if (response.status === 404) return { sha: '', doc: emptyDocument() };
  if (!response.ok) throw new Error(`github_read_${response.status}`);

  const body = await response.json();
  const text = body && typeof body.content === 'string' ? decodeBase64(body.content) : '';
  let doc = emptyDocument();
  if (text.trim()) {
    try {
      doc = normalizeDocument(JSON.parse(text));
    } catch (error) {
      throw new Error('invalid_ledger_json');
    }
  }
  return { sha: body && typeof body.sha === 'string' ? body.sha : '', doc };
}

async function appendEntry(env, entry) {
  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
    let current;
    try {
      current = await readDocument(env);
    } catch (error) {
      throw new Error(error.message === 'invalid_ledger_json' ? 'invalid_ledger_json' : 'github_unavailable');
    }

    const existing = current.doc.entries.find((item) => item.id === entry.id);
    if (existing) return { created: false, entry: existing };

    current.doc.entries.push(entry);
    if (current.doc.entries.length > MAX_ENTRIES) {
      current.doc.entries = current.doc.entries.slice(-MAX_ENTRIES);
    }
    current.doc.updatedAt = new Date().toISOString();

    const message = `Ghi khoản chi: ${entry.name.replace(/[\r\n]+/g, ' ').slice(0, 100)}`;
    const response = await githubRequest(env, LEDGER_PATH, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        content: encodeBase64(JSON.stringify(current.doc, null, 2)),
        branch: env.LEDGER_BRANCH || 'main',
        ...(current.sha ? { sha: current.sha } : {}),
      }),
    });

    if (response.ok) return { created: true, entry };
    if (response.status === 409) {
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      continue;
    }
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      throw new Error('github_forbidden');
    }
    if (response.status === 429) throw new Error('github_rate_limit');
    throw new Error(`github_write_${response.status}`);
  }
  throw new Error('write_conflict');
}

function errorResponse(error, origin) {
  const code = error && error.message ? error.message : '';
  if (code === 'github_forbidden') {
    return jsonResponse({ error: 'Worker chưa có quyền ghi file dữ liệu trên GitHub.' }, 502, origin);
  }
  if (code === 'github_rate_limit') {
    return jsonResponse({ error: 'GitHub tạm giới hạn truy cập, thử lại sau ít phút.' }, 503, origin);
  }
  if (code === 'write_conflict') {
    return jsonResponse({ error: 'File dữ liệu đang được cập nhật, thử lại sau.' }, 503, origin);
  }
  if (code === 'invalid_ledger_json') {
    return jsonResponse({ error: 'File dữ liệu trên GitHub không phải JSON hợp lệ.' }, 502, origin);
  }
  console.error('ledger worker error', code || error);
  return jsonResponse({ error: 'Không ghi được dữ liệu lúc này, thử lại sau.' }, 502, origin);
}

async function handleReadEntries(env, origin) {
  if (!env.GITHUB_TOKEN) {
    return jsonResponse({ error: 'Worker chưa được cấu hình token GitHub.' }, 500, origin);
  }

  try {
    const ref = encodeURIComponent(env.LEDGER_BRANCH || 'main');
    const response = await githubRequest(env, `${LEDGER_PATH}?ref=${ref}`, {
      headers: { Accept: 'application/vnd.github.raw' },
    });
    if (response.status === 404) return jsonResponse(emptyDocument(), 200, origin);
    if (!response.ok) {
      return jsonResponse({ error: `GitHub trả về lỗi ${response.status}.` }, 502, origin);
    }
    const text = await response.text();
    try {
      JSON.parse(text);
    } catch (error) {
      return jsonResponse({ error: 'File dữ liệu trên GitHub không phải JSON hợp lệ.' }, 502, origin);
    }
    return new Response(text, {
      status: 200,
      headers: Object.assign(
        corsHeaders(origin),
        { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=15' },
      ),
    });
  } catch (error) {
    return errorResponse(error, origin);
  }
}

async function handleAddEntry(request, env, origin) {
  if (!env.GITHUB_TOKEN) {
    return jsonResponse({ error: 'Worker chưa được cấu hình token GitHub.' }, 500, origin);
  }

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return jsonResponse({ error: 'Dữ liệu gửi lên quá lớn.' }, 413, origin);
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    return jsonResponse({ error: 'Nội dung gửi lên phải là JSON.' }, 400, origin);
  }

  const draft = validateDraft(payload || {});
  if (draft.error) return jsonResponse({ error: draft.error }, 400, origin);

  const clientKey =
    payload && typeof payload.clientKey === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(payload.clientKey)
      ? payload.clientKey
      : crypto.randomUUID();

  const entry = {
    id: clientKey,
    name: draft.name,
    description: draft.description,
    qty: draft.qty,
    price: draft.price,
    createdAt: new Date().toISOString(),
  };

  try {
    const result = await appendEntry(env, entry);
    return jsonResponse({ ok: true, created: result.created, entry: result.entry }, 200, origin);
  } catch (error) {
    return errorResponse(error, origin);
  }
}

export default {
  async fetch(request, env) {
    const origin = resolveOrigin(request, env);
    if (origin === null) {
      return new Response(JSON.stringify({ error: 'Origin không được phép.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    if (request.method === 'OPTIONS') return preflight(origin || '*');

    const url = new URL(request.url);
    if ((url.pathname === '/' || url.pathname === '/health') && request.method === 'GET') {
      return jsonResponse({ ok: true, service: 'quan-li-ledger' }, 200, origin);
    }
    if (url.pathname === '/entries' && request.method === 'GET') {
      return handleReadEntries(env, origin);
    }
    if (url.pathname === '/entries' && request.method === 'POST') {
      return handleAddEntry(request, env, origin);
    }
    return jsonResponse({ error: 'Không tìm thấy.' }, 404, origin);
  },
};
