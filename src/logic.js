// Pure business rules, kept separate from HTTP so they are easy to unit test.

const round2 = n => Math.round(n * 100) / 100;

function areaM2(room) {
  return round2(room.lengthM * room.widthM);
}

/** Item fits when footprint <= 25% of floor area and longest side <= 80% of the longer wall. */
function fitsRoom(product, room) {
  const footprintM2 = (product.widthCm * product.depthCm) / 10000;
  const longestSideM = Math.max(product.widthCm, product.depthCm) / 100;
  const longerWallM = Math.max(room.lengthM, room.widthM);
  return footprintM2 <= 0.25 * room.lengthM * room.widthM && longestSideM <= 0.8 * longerWallM;
}

/** 60 points for a style match plus up to 40 for being cheap relative to the remaining budget. */
function score(product, roomStyle, remainingBudget) {
  const styleMatch = !!roomStyle && product.styles.includes(roomStyle);
  const cheapness = remainingBudget > 0 ? Math.max(0, 1 - product.priceVnd / remainingBudget) : 0;
  return { styleMatch, score: Math.round((styleMatch ? 60 : 0) + 40 * cheapness) };
}

function savedTotal(room, products) {
  let total = 0;
  for (const [pid, qty] of room.saved) {
    const p = products.get(pid);
    if (p) total += p.priceVnd * qty;
  }
  return total;
}

function shortlist(room, products) {
  const items = [];
  for (const [pid, qty] of room.saved) {
    const product = products.get(pid);
    if (!product) continue;
    items.push({ product, quantity: qty, lineTotalVnd: product.priceVnd * qty });
  }
  const totalVnd = items.reduce((s, l) => s + l.lineTotalVnd, 0);
  return {
    roomId: room.id, items, totalVnd, budgetVnd: room.budgetVnd,
    budgetRemainingVnd: room.budgetVnd - totalVnd, overBudget: totalVnd > room.budgetVnd,
  };
}

function publicRoom(room) {
  return {
    id: room.id, ...(room.name ? { name: room.name } : {}), lengthM: room.lengthM, widthM: room.widthM,
    areaM2: areaM2(room), budgetVnd: room.budgetVnd, analysis: room.analysis,
    createdAt: room.createdAt, updatedAt: room.updatedAt,
  };
}

function recommend(room, products, { category, includeOtherStyles, sort }) {
  const remaining = room.budgetVnd - savedTotal(room, products);
  const style = room.analysis ? room.analysis.style : null;
  let list = [...products.values()].filter(p => p.inStock && p.priceVnd <= remaining && fitsRoom(p, room));
  if (category) list = list.filter(p => p.category === category);
  if (style && !includeOtherStyles) list = list.filter(p => p.styles.includes(style));
  let items = list.map(p => ({ product: p, fitsRoom: true, ...score(p, style, remaining) }));
  const bySort = {
    score: (a, b) => b.score - a.score || a.product.priceVnd - b.product.priceVnd,
    price_asc: (a, b) => a.product.priceVnd - b.product.priceVnd,
    price_desc: (a, b) => b.product.priceVnd - a.product.priceVnd,
  };
  items.sort(bySort[sort || 'score']);
  return { items, style, remaining };
}

module.exports = { areaM2, fitsRoom, score, savedTotal, shortlist, publicRoom, recommend };
