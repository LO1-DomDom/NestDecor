// Smoke test for every endpoint. Runs the app in-process with response validation ON,
// so any response that does not match openapi.yaml fails the test.
// Usage: npm test
const assert = require('assert');
const { createApp } = require('../src/app');

let passed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log('  ok  ', name); }
  catch (e) { console.error('  FAIL', name, '\n      ', e.message); process.exitCode = 1; }
}

(async () => {
  const { app } = createApp({ validateResponses: true, rateLimit: false });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, {
      method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, headers: res.headers, text };
  };
  const KEY = { 'x-api-key': 'nestdecor-demo-key' };

  console.log('Health and docs');
  await t('GET /health', async () => {
    const r = await call('GET', '/health');
    assert.strictEqual(r.status, 200); assert.strictEqual(r.json.status, 'ok'); assert.strictEqual(r.json.products, 31);
  });
  await t('GET /openapi.json serves the spec', async () => {
    const r = await call('GET', '/openapi.json'); assert.strictEqual(r.status, 200); assert.strictEqual(r.json.openapi, '3.0.3');
  });
  await t('GET /docs serves Swagger UI', async () => {
    const r = await call('GET', '/docs/'); assert.strictEqual(r.status, 200); assert.ok(r.text.includes('swagger-ui'));
  });

  console.log('Collection 1: Catalog');
  await t('list products with defaults', async () => {
    const r = await call('GET', '/api/catalog/products');
    assert.strictEqual(r.status, 200); assert.strictEqual(r.json.total, 31); assert.strictEqual(r.json.items.length, 20);
  });
  await t('filter by category, style, price, sort, paging', async () => {
    const r = await call('GET', '/api/catalog/products?category=desk&style=minimalism&maxPrice=700000&sort=price_asc&limit=5');
    assert.strictEqual(r.status, 200);
    assert.ok(r.json.items.length >= 1);
    assert.ok(r.json.items.every(p => p.category === 'desk' && p.styles.includes('minimalism') && p.priceVnd <= 700000));
    const prices = r.json.items.map(p => p.priceVnd);
    assert.deepStrictEqual(prices, [...prices].sort((a, b) => a - b));
    const p2 = await call('GET', '/api/catalog/products?limit=10&page=4');
    assert.strictEqual(p2.json.items.length, 1);
  });
  await t('text search', async () => {
    const r = await call('GET', '/api/catalog/products?q=MIRROR');
    assert.strictEqual(r.json.total, 2);
  });
  await t('invalid query is rejected (400)', async () => {
    assert.strictEqual((await call('GET', '/api/catalog/products?category=spaceship')).status, 400);
    assert.strictEqual((await call('GET', '/api/catalog/products?limit=1000')).status, 400);
    assert.strictEqual((await call('GET', '/api/catalog/products?bogus=1')).status, 400);
  });
  await t('get product / 404', async () => {
    const ok = await call('GET', '/api/catalog/products/p001');
    assert.strictEqual(ok.status, 200); assert.strictEqual(ok.json.id, 'p001');
    const nf = await call('GET', '/api/catalog/products/p999');
    assert.strictEqual(nf.status, 404); assert.strictEqual(nf.json.error.code, 'NOT_FOUND');
    assert.strictEqual((await call('GET', '/api/catalog/products/abc')).status, 400);
  });
  await t('categories and styles', async () => {
    const c = await call('GET', '/api/catalog/categories');
    assert.strictEqual(c.json.items.length, 12);
    assert.strictEqual(c.json.items.reduce((s, x) => s + x.count, 0), 31);
    const s = await call('GET', '/api/catalog/styles');
    assert.deepStrictEqual(s.json.items.map(x => x.style), ['minimalism', 'scandinavian', 'vintage']);
  });
  let newId;
  await t('write needs api key (401), then create (201)', async () => {
    const body = { name: 'Test bedside table', category: 'table', styles: ['minimalism'], priceVnd: 210000, widthCm: 35, depthCm: 30, heightCm: 48, source: 'Shopee', sellerUrl: 'https://shopee.vn/x' };
    assert.strictEqual((await call('POST', '/api/catalog/products', body)).status, 401);
    assert.strictEqual((await call('POST', '/api/catalog/products', body, { 'x-api-key': 'wrong' })).status, 401);
    const r = await call('POST', '/api/catalog/products', body, KEY);
    assert.strictEqual(r.status, 201); assert.strictEqual(r.json.linkClicks, 0); assert.strictEqual(r.json.inStock, true);
    assert.ok(r.headers.get('location').endsWith('/' + r.json.id));
    newId = r.json.id;
  });
  await t('create validation errors (400)', async () => {
    const r = await call('POST', '/api/catalog/products', { name: 'x' }, KEY);
    assert.strictEqual(r.status, 400); assert.strictEqual(r.json.error.code, 'VALIDATION_ERROR');
    const bad = await call('POST', '/api/catalog/products', '{not json', KEY);
    assert.strictEqual(bad.status, 400);
  });
  await t('replace product (PUT) and 404', async () => {
    const body = { name: 'Test bedside table v2', category: 'table', styles: ['vintage'], priceVnd: 230000, widthCm: 35, depthCm: 30, heightCm: 48, source: 'Tiki', sellerUrl: 'https://tiki.vn/x', inStock: false };
    const r = await call('PUT', `/api/catalog/products/${newId}`, body, KEY);
    assert.strictEqual(r.status, 200); assert.strictEqual(r.json.name, 'Test bedside table v2'); assert.strictEqual(r.json.inStock, false);
    assert.strictEqual((await call('PUT', '/api/catalog/products/p998', body, KEY)).status, 404);
    assert.strictEqual((await call('PUT', `/api/catalog/products/${newId}`, body)).status, 401);
  });
  await t('record seller-link click', async () => {
    const a = await call('POST', '/api/catalog/products/p001/click');
    assert.strictEqual(a.status, 200); assert.strictEqual(a.json.linkClicks, 1);
    const b = await call('POST', '/api/catalog/products/p001/click');
    assert.strictEqual(b.json.linkClicks, 2);
    assert.ok(b.json.sellerUrl.startsWith('https://'));
    assert.strictEqual((await call('GET', '/api/catalog/products/p001')).json.linkClicks, 2);
    assert.strictEqual((await call('POST', '/api/catalog/products/p998/click')).status, 404);
  });

  console.log('Collection 2: Rooms');
  let room; const dev = { 'x-device-id': 'test-device' };
  await t('create room (201) and validate input', async () => {
    const r = await call('POST', '/api/rooms', { name: 'Dorm B4', lengthM: 4, widthM: 3, budgetVnd: 3000000 }, dev);
    assert.strictEqual(r.status, 201); room = r.json;
    assert.strictEqual(room.areaM2, 12); assert.strictEqual(room.analysis, null);
    assert.ok(r.headers.get('location').endsWith(room.id));
    assert.strictEqual((await call('POST', '/api/rooms', { lengthM: 0.1, widthM: 3, budgetVnd: 1 })).status, 400);
    assert.strictEqual((await call('POST', '/api/rooms', { lengthM: 4, widthM: 3 })).status, 400);
    assert.strictEqual((await call('POST', '/api/rooms', { lengthM: 4, widthM: 3, budgetVnd: 1, extra: true })).status, 400);
  });
  await t('list is scoped by X-Device-Id', async () => {
    const mine = await call('GET', '/api/rooms', undefined, dev);
    assert.strictEqual(mine.json.items.length, 1);
    const other = await call('GET', '/api/rooms', undefined, { 'x-device-id': 'someone-else' });
    assert.strictEqual(other.json.items.length, 0);
    assert.strictEqual((await call('GET', '/api/rooms', undefined, { 'x-device-id': 'bad id!' })).status, 400);
  });
  await t('get room / 404 / bad uuid', async () => {
    assert.strictEqual((await call('GET', `/api/rooms/${room.id}`)).json.id, room.id);
    assert.strictEqual((await call('GET', '/api/rooms/3f2504e0-4f89-11d3-9a0c-0305e82c3301')).status, 404);
    assert.strictEqual((await call('GET', '/api/rooms/not-a-uuid')).status, 400);
  });
  await t('recommendations before analysis: all styles, within budget and fit', async () => {
    const r = await call('GET', `/api/rooms/${room.id}/recommendations?limit=100`);
    assert.strictEqual(r.status, 200); assert.strictEqual(r.json.styleApplied, null);
    assert.strictEqual(r.json.budgetRemainingVnd, 3000000);
    assert.ok(r.json.items.length > 10);
    assert.ok(r.json.items.every(i => i.product.priceVnd <= 3000000 && i.fitsRoom));
    assert.ok(!r.json.items.some(i => i.product.id === newId), 'out-of-stock item must not be recommended');
  });
  await t('PUT analysis (on-device) and validation', async () => {
    const r = await call('PUT', `/api/rooms/${room.id}/analysis`, { style: 'minimalism', lightLevel: 'bright', palette: ['#F5F0E6', '#C8B8A0'], confidence: 0.82, source: 'on-device' });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.json.analysis.style, 'minimalism'); assert.ok(r.json.analysis.analysedAt);
    assert.strictEqual((await call('PUT', `/api/rooms/${room.id}/analysis`, { style: 'baroque', source: 'manual' })).status, 400);
    assert.strictEqual((await call('PUT', `/api/rooms/${room.id}/analysis`, { style: 'vintage', palette: ['red'], source: 'manual' })).status, 400);
    assert.strictEqual((await call('PUT', `/api/rooms/${room.id}/analysis`, { style: 'vintage', confidence: 1.5, source: 'manual' })).status, 400);
  });
  await t('recommendations after analysis: style ranked first, others excluded', async () => {
    const r = await call('GET', `/api/rooms/${room.id}/recommendations?limit=100`);
    assert.strictEqual(r.json.styleApplied, 'minimalism');
    assert.ok(r.json.items.every(i => i.product.styles.includes('minimalism') && i.styleMatch));
    const scores = r.json.items.map(i => i.score);
    assert.deepStrictEqual(scores, [...scores].sort((a, b) => b - a));
    const all = await call('GET', `/api/rooms/${room.id}/recommendations?limit=100&includeOtherStyles=true`);
    assert.ok(all.json.total > r.json.total);
    const beds = await call('GET', `/api/rooms/${room.id}/recommendations?category=bed&sort=price_asc`);
    assert.ok(beds.json.items.every(i => i.product.category === 'bed'));
  });
  await t('fit rule: a tiny room rejects big items', async () => {
    const tiny = (await call('POST', '/api/rooms', { lengthM: 1.5, widthM: 1.5, budgetVnd: 5000000 })).json;
    const r = await call('GET', `/api/rooms/${tiny.id}/recommendations?category=bed`);
    assert.strictEqual(r.json.total, 0); assert.ok(r.json.hint);
  });
  await t('shortlist: save, accumulate quantity, totals, over budget', async () => {
    const a = await call('POST', `/api/rooms/${room.id}/saved-items`, { productId: 'p001' });
    assert.strictEqual(a.status, 201); assert.strictEqual(a.json.totalVnd, 850000); assert.strictEqual(a.json.budgetRemainingVnd, 2150000); assert.strictEqual(a.json.overBudget, false);
    const b = await call('POST', `/api/rooms/${room.id}/saved-items`, { productId: 'p001', quantity: 2 });
    assert.strictEqual(b.json.items[0].quantity, 3); assert.strictEqual(b.json.totalVnd, 2550000);
    const c = await call('POST', `/api/rooms/${room.id}/saved-items`, { productId: 'p002' });
    assert.strictEqual(c.json.overBudget, true); assert.ok(c.json.budgetRemainingVnd < 0);
    const rec = await call('GET', `/api/rooms/${room.id}/recommendations`);
    assert.strictEqual(rec.json.savedTotalVnd, c.json.totalVnd);
    assert.strictEqual(rec.json.total, 0); assert.ok(rec.json.hint.includes('budget'));
    assert.strictEqual((await call('GET', `/api/rooms/${room.id}/saved-items`)).json.items.length, 2);
  });
  await t('shortlist errors: unknown product, out of stock, bad quantity', async () => {
    assert.strictEqual((await call('POST', `/api/rooms/${room.id}/saved-items`, { productId: 'p998' })).status, 404);
    const oos = await call('POST', `/api/rooms/${room.id}/saved-items`, { productId: newId });
    assert.strictEqual(oos.status, 409); assert.strictEqual(oos.json.error.code, 'PRODUCT_UNAVAILABLE');
    assert.strictEqual((await call('POST', `/api/rooms/${room.id}/saved-items`, { productId: 'p001', quantity: 0 })).status, 400);
    assert.strictEqual((await call('POST', `/api/rooms/${room.id}/saved-items`, { productId: 'p001', quantity: 11 })).status, 400);
  });
  await t('remove saved item, 404 when not saved', async () => {
    const r = await call('DELETE', `/api/rooms/${room.id}/saved-items/p002`);
    assert.strictEqual(r.status, 200); assert.strictEqual(r.json.items.length, 1);
    assert.strictEqual((await call('DELETE', `/api/rooms/${room.id}/saved-items/p002`)).status, 404);
  });
  await t('PATCH room changes budget; empty patch rejected', async () => {
    const r = await call('PATCH', `/api/rooms/${room.id}`, { budgetVnd: 6000000, lengthM: 5 });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.json.areaM2, 15); assert.strictEqual(r.json.budgetVnd, 6000000);
    assert.strictEqual((await call('PATCH', `/api/rooms/${room.id}`, {})).status, 400);
    assert.strictEqual((await call('PATCH', `/api/rooms/${room.id}`, { budgetVnd: -5 })).status, 400);
  });
  await t('deleting a product removes it from shortlists', async () => {
    assert.strictEqual((await call('DELETE', '/api/catalog/products/p001', undefined, {})).status, 401);
    assert.strictEqual((await call('DELETE', '/api/catalog/products/p001', undefined, KEY)).status, 204);
    assert.strictEqual((await call('GET', '/api/catalog/products/p001')).status, 404);
    const s = await call('GET', `/api/rooms/${room.id}/saved-items`);
    assert.strictEqual(s.json.items.length, 0); assert.strictEqual(s.json.totalVnd, 0);
  });
  await t('delete room', async () => {
    assert.strictEqual((await call('DELETE', `/api/rooms/${room.id}`)).status, 204);
    assert.strictEqual((await call('GET', `/api/rooms/${room.id}`)).status, 404);
    assert.strictEqual((await call('DELETE', `/api/rooms/${room.id}`)).status, 404);
  });
  await t('unknown route and wrong method give JSON errors', async () => {
    const nf = await call('GET', '/api/nope'); assert.strictEqual(nf.status, 404); assert.strictEqual(nf.json.error.code, 'NOT_FOUND');
    const m = await call('POST', '/health'); assert.ok([404, 405].includes(m.status)); assert.ok(m.json && m.json.error);
  });

  server.close();
  console.log(`\n${passed} checks passed${process.exitCode ? ', with FAILURES' : ''}`);
})();
