const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const MAX_ROOMS = 5000;
const MAX_DISTINCT_SAVED = 50;

function createStore() {
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'products.json'), 'utf8'));
  const products = new Map(seed.map(p => [p.id, { ...p, linkClicks: 0 }]));
  const rooms = new Map(); // id -> room (+ deviceId, saved Map)
  let nextProductNum = seed.length + 1;

  const now = () => new Date().toISOString();

  return {
    // ---------- products ----------
    products,
    newProductId() {
      let id;
      do { id = 'p' + String(nextProductNum++).padStart(3, '0'); } while (products.has(id));
      return id;
    },
    createProduct(input) {
      const p = { inStock: true, colors: [], imageUrl: null, ...input, id: this.newProductId(), linkClicks: 0, updatedAt: now() };
      products.set(p.id, p);
      return p;
    },
    replaceProduct(id, input) {
      const old = products.get(id);
      const p = { inStock: true, colors: [], imageUrl: null, ...input, id, linkClicks: old.linkClicks, updatedAt: now() };
      products.set(id, p);
      return p;
    },
    deleteProduct(id) {
      products.delete(id);
      for (const r of rooms.values()) r.saved.delete(id);
    },

    // ---------- rooms ----------
    rooms,
    createRoom(deviceId, input) {
      if (rooms.size >= MAX_ROOMS) {
        const oldest = rooms.keys().next().value; // Map keeps insertion order
        rooms.delete(oldest);
      }
      const t = now();
      const r = { id: randomUUID(), deviceId, name: input.name, lengthM: input.lengthM, widthM: input.widthM,
        budgetVnd: input.budgetVnd, analysis: null, saved: new Map(), createdAt: t, updatedAt: t };
      rooms.set(r.id, r);
      return r;
    },
    touch(room) { room.updatedAt = now(); },
    nowIso: now,
    MAX_DISTINCT_SAVED,
  };
}

module.exports = { createStore };
