const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const OpenApiValidator = require('express-openapi-validator');

const { loadSpec } = require('./spec');
const { createStore } = require('./store');
const logic = require('./logic');

const START = Date.now();
const CATEGORIES = ['bed', 'mattress', 'wardrobe', 'desk', 'chair', 'shelf', 'lamp', 'rug', 'curtain', 'storage', 'mirror', 'table'];
const STYLES = ['minimalism', 'scandinavian', 'vintage'];

function httpError(status, code, message) {
  const e = new Error(message);
  e.status = status; e.code = code;
  return e;
}

function paginate(arr, page = 1, limit = 20) {
  const start = (page - 1) * limit;
  return { items: arr.slice(start, start + limit), page, limit, total: arr.length };
}

function createApp(opts = {}) {
  const adminKey = opts.adminApiKey || process.env.ADMIN_API_KEY || 'nestdecor-demo-key';
  const spec = loadSpec();
  const store = createStore();
  const { products, rooms } = store;

  const app = express();
  app.set('trust proxy', 1); // behind Render/Railway/Fly proxy, so rate limiting sees the real client IP
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '50kb' }));

  if (opts.rateLimit !== false) {
    app.use(rateLimit({
      windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false,
      handler: (req, res) => res.status(429).json({ error: { code: 'TOO_MANY_REQUESTS', message: 'Rate limit exceeded. Try again in a minute.' } }),
    }));
  }

  // ----- documentation -----
  app.get('/openapi.json', (req, res) => res.json(spec));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec, {
    customSiteTitle: 'NestDecor API docs',
    swaggerOptions: { tagsSorter: 'alpha', operationsSorter: 'alpha', docExpansion: 'list', persistAuthorization: true, tryItOutEnabled: true },
  }));
  app.get('/', (req, res) => res.redirect('/docs'));

  // ----- validation (request, security and optionally response) -----
  app.use(OpenApiValidator.middleware({
    apiSpec: spec,
    validateRequests: { allowUnknownQueryParameters: false },
    validateResponses: !!opts.validateResponses,
    validateSecurity: {
      handlers: {
        ApiKeyAuth: req => req.get('x-api-key') === adminKey,
      },
    },
    ignorePaths: /^\/(docs|openapi\.json)(\/|$)/,
  }));

  const getProduct = id => {
    const p = products.get(id);
    if (!p) throw httpError(404, 'NOT_FOUND', `Product ${id} not found.`);
    return p;
  };
  const getRoom = id => {
    const r = rooms.get(id);
    if (!r) throw httpError(404, 'NOT_FOUND', `Room ${id} not found.`);
    return r;
  };
  const deviceOf = req => req.get('x-device-id') || 'anonymous';

  // ================= Health =================
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptimeSeconds: Math.round((Date.now() - START) / 1000), products: products.size, rooms: rooms.size });
  });

  // ================= Collection 1: Catalog =================
  app.get('/api/catalog/products', (req, res) => {
    const q = req.query;
    let list = [...products.values()];
    if (q.category) list = list.filter(p => p.category === q.category);
    if (q.style) list = list.filter(p => p.styles.includes(q.style));
    if (q.source) list = list.filter(p => p.source === q.source);
    if (q.minPrice !== undefined) list = list.filter(p => p.priceVnd >= q.minPrice);
    if (q.maxPrice !== undefined) list = list.filter(p => p.priceVnd <= q.maxPrice);
    if (q.inStock !== undefined) list = list.filter(p => p.inStock === q.inStock);
    if (q.q) { const n = q.q.toLowerCase(); list = list.filter(p => p.name.toLowerCase().includes(n)); }
    const sorters = {
      newest: (a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id),
      price_asc: (a, b) => a.priceVnd - b.priceVnd,
      price_desc: (a, b) => b.priceVnd - a.priceVnd,
      name: (a, b) => a.name.localeCompare(b.name),
    };
    list.sort(sorters[q.sort || 'newest']);
    res.json(paginate(list, q.page || 1, q.limit || 20));
  });

  app.post('/api/catalog/products', (req, res) => {
    if (products.size >= 2000) throw httpError(409, 'CATALOG_FULL', 'Catalog limit reached.');
    const p = store.createProduct(req.body);
    res.status(201).location(`/api/catalog/products/${p.id}`).json(p);
  });

  app.get('/api/catalog/products/:productId', (req, res) => res.json(getProduct(req.params.productId)));

  app.put('/api/catalog/products/:productId', (req, res) => {
    getProduct(req.params.productId);
    res.json(store.replaceProduct(req.params.productId, req.body));
  });

  app.delete('/api/catalog/products/:productId', (req, res) => {
    getProduct(req.params.productId);
    store.deleteProduct(req.params.productId);
    res.status(204).end();
  });

  app.post('/api/catalog/products/:productId/click', (req, res) => {
    const p = getProduct(req.params.productId);
    p.linkClicks += 1;
    res.json({ productId: p.id, sellerUrl: p.sellerUrl, linkClicks: p.linkClicks });
  });

  app.get('/api/catalog/categories', (req, res) => {
    res.json({ items: CATEGORIES.map(category => ({ category, count: [...products.values()].filter(p => p.category === category).length })) });
  });

  app.get('/api/catalog/styles', (req, res) => {
    res.json({ items: STYLES.map(style => ({ style, count: [...products.values()].filter(p => p.styles.includes(style)).length })) });
  });

  // ================= Collection 2: Rooms =================
  app.get('/api/rooms', (req, res) => {
    const device = deviceOf(req);
    const items = [...rooms.values()].filter(r => r.deviceId === device).map(logic.publicRoom)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ items });
  });

  app.post('/api/rooms', (req, res) => {
    const r = store.createRoom(deviceOf(req), req.body);
    res.status(201).location(`/api/rooms/${r.id}`).json(logic.publicRoom(r));
  });

  app.get('/api/rooms/:roomId', (req, res) => res.json(logic.publicRoom(getRoom(req.params.roomId))));

  app.patch('/api/rooms/:roomId', (req, res) => {
    const r = getRoom(req.params.roomId);
    for (const k of ['name', 'lengthM', 'widthM', 'budgetVnd']) if (req.body[k] !== undefined) r[k] = req.body[k];
    store.touch(r);
    res.json(logic.publicRoom(r));
  });

  app.delete('/api/rooms/:roomId', (req, res) => {
    getRoom(req.params.roomId);
    rooms.delete(req.params.roomId);
    res.status(204).end();
  });

  app.put('/api/rooms/:roomId/analysis', (req, res) => {
    const r = getRoom(req.params.roomId);
    r.analysis = { ...req.body, analysedAt: store.nowIso() };
    store.touch(r);
    res.json(logic.publicRoom(r));
  });

  app.get('/api/rooms/:roomId/recommendations', (req, res) => {
    const r = getRoom(req.params.roomId);
    const q = req.query;
    const { items, style, remaining } = logic.recommend(r, products, { category: q.category, includeOtherStyles: q.includeOtherStyles, sort: q.sort });
    const page = paginate(items, q.page || 1, q.limit || 20);
    const body = {
      roomId: r.id, styleApplied: style, budgetVnd: r.budgetVnd, savedTotalVnd: r.budgetVnd - remaining,
      budgetRemainingVnd: remaining, ...page,
    };
    if (items.length === 0) {
      body.hint = remaining <= 0
        ? 'The budget is used up. Remove a saved item or raise the budget.'
        : 'No items match. Raise the budget, try another category, or set includeOtherStyles=true.';
    }
    res.json(body);
  });

  app.get('/api/rooms/:roomId/saved-items', (req, res) => {
    res.json(logic.shortlist(getRoom(req.params.roomId), products));
  });

  app.post('/api/rooms/:roomId/saved-items', (req, res) => {
    const r = getRoom(req.params.roomId);
    const { productId, quantity = 1 } = req.body;
    const p = getProduct(productId);
    if (!p.inStock) throw httpError(409, 'PRODUCT_UNAVAILABLE', `Product ${productId} is out of stock.`);
    if (!r.saved.has(productId) && r.saved.size >= store.MAX_DISTINCT_SAVED) {
      throw httpError(409, 'SHORTLIST_FULL', `A shortlist holds at most ${store.MAX_DISTINCT_SAVED} distinct items.`);
    }
    r.saved.set(productId, Math.min(10, (r.saved.get(productId) || 0) + quantity));
    store.touch(r);
    res.status(201).json(logic.shortlist(r, products));
  });

  app.delete('/api/rooms/:roomId/saved-items/:productId', (req, res) => {
    const r = getRoom(req.params.roomId);
    if (!r.saved.has(req.params.productId)) throw httpError(404, 'NOT_FOUND', `Product ${req.params.productId} is not in the shortlist.`);
    r.saved.delete(req.params.productId);
    store.touch(r);
    res.json(logic.shortlist(r, products));
  });

  // ----- errors -----
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    let status = err.status || err.statusCode || 500;
    let code = err.code && typeof err.code === 'string' && /^[A-Z_]+$/.test(err.code) ? err.code : null;
    let message = err.message || 'Unexpected error.';
    if (!code) {
      code = { 400: 'VALIDATION_ERROR', 401: 'UNAUTHORIZED', 404: 'NOT_FOUND', 405: 'METHOD_NOT_ALLOWED', 413: 'PAYLOAD_TOO_LARGE', 415: 'UNSUPPORTED_MEDIA_TYPE' }[status] || (status >= 500 ? 'INTERNAL_ERROR' : 'ERROR');
    }
    if (err.type === 'entity.parse.failed') { status = 400; code = 'VALIDATION_ERROR'; message = 'Request body is not valid JSON.'; }
    if (status === 401) message = 'A valid x-api-key header is required.';
    if (status >= 500) { console.error(err); message = 'Internal server error.'; }
    res.status(status).json({ error: { code, message } });
  });

  return { app, store };
}

module.exports = { createApp };
