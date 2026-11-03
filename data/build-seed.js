// Generates data/products.json (sample catalog). Prices/sizes are ILLUSTRATIVE sample data
// until the team replaces them with 40 real, verified items (backlog task T7).
const fs = require('fs');
const S = (kw, src) => src === 'Tiki' ? `https://tiki.vn/search?q=${encodeURIComponent(kw)}`
  : src === 'Shopee' ? `https://shopee.vn/search?keyword=${encodeURIComponent(kw)}`
  : `https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(kw)}`;
// [name, category, styles, price, w, d, h, colors, source, searchKeyword]
const rows = [
  ['Folding bed frame 1m2, engineered wood', 'bed', ['minimalism', 'scandinavian'], 850000, 120, 200, 40, ['natural wood', 'white'], 'Shopee', 'giuong gap go cong nghiep 1m2'],
  ['Platform bed 1m4 with drawers', 'bed', ['minimalism', 'scandinavian'], 2350000, 140, 200, 35, ['light oak', 'white'], 'Shopee', 'giuong ngu 1m4 co ngan keo'],
  ['Wrought-iron bed frame 1m2', 'bed', ['vintage'], 1450000, 120, 200, 90, ['black'], 'Shopee', 'giuong sat 1m2'],
  ['Floor futon mattress 90cm', 'mattress', ['minimalism', 'scandinavian', 'vintage'], 520000, 90, 190, 8, ['grey'], 'Tiki', 'nem topper 90x190'],
  ['Foam mattress 1m2 x 10cm', 'mattress', ['minimalism', 'scandinavian', 'vintage'], 1180000, 120, 200, 10, ['white'], 'Tiki', 'nem foam 1m2 10cm'],
  ['3-compartment fabric wardrobe', 'wardrobe', ['minimalism', 'scandinavian'], 450000, 130, 45, 170, ['beige', 'grey'], 'Tiki', 'tu quan ao vai 3 ngan'],
  ['Open clothes rack with shelf', 'wardrobe', ['minimalism', 'vintage'], 390000, 90, 40, 160, ['black'], 'Shopee', 'ke treo quan ao co ke'],
  ['2-door wooden wardrobe 80cm', 'wardrobe', ['scandinavian', 'vintage'], 1890000, 80, 50, 180, ['light oak'], 'Shopee', 'tu quan ao go 2 canh'],
  ['Foldable study desk 100cm', 'desk', ['minimalism', 'scandinavian'], 320000, 100, 50, 74, ['natural wood', 'white'], 'Workshop', 'ban hoc gap gon'],
  ['Desk 120cm with shelf', 'desk', ['minimalism'], 690000, 120, 55, 120, ['white', 'black'], 'Shopee', 'ban lam viec 1m2 co ke'],
  ['Retro writing desk 110cm', 'desk', ['vintage'], 1250000, 110, 55, 76, ['walnut'], 'Shopee', 'ban lam viec go vintage'],
  ['Mesh ergonomic chair', 'chair', ['minimalism'], 590000, 55, 55, 95, ['black'], 'Shopee', 'ghe van phong luoi'],
  ['Wooden dining chair', 'chair', ['scandinavian', 'vintage'], 280000, 42, 45, 82, ['light oak'], 'Tiki', 'ghe go an'],
  ['Folding stool', 'chair', ['minimalism', 'scandinavian'], 95000, 30, 30, 45, ['white'], 'Shopee', 'ghe xep nho'],
  ['3-tier bookshelf 60cm', 'shelf', ['minimalism', 'scandinavian'], 240000, 60, 28, 110, ['white'], 'Shopee', 'ke sach 3 tang'],
  ['5-tier ladder shelf', 'shelf', ['scandinavian', 'vintage'], 420000, 55, 35, 170, ['walnut'], 'Tiki', 'ke sach 5 tang'],
  ['Wall floating shelf set (3)', 'shelf', ['minimalism', 'scandinavian'], 135000, 60, 18, 3, ['white', 'light oak'], 'Shopee', 'ke treo tuong 3 cai'],
  ['Desk lamp, warm LED', 'lamp', ['minimalism', 'scandinavian'], 160000, 15, 15, 40, ['white'], 'Tiki', 'den ban led'],
  ['Rattan pendant lamp 40cm', 'lamp', ['scandinavian', 'vintage'], 210000, 40, 40, 30, ['rattan'], 'Shopee', 'den tha may tre'],
  ['Floor lamp, tripod', 'lamp', ['scandinavian', 'vintage'], 480000, 40, 40, 150, ['black', 'wood'], 'Shopee', 'den cay dung'],
  ['Shaggy rug 120x160', 'rug', ['scandinavian', 'minimalism'], 290000, 120, 160, 2, ['cream'], 'Shopee', 'tham long 120x160'],
  ['Persian-style rug 100x150', 'rug', ['vintage'], 360000, 100, 150, 1, ['red', 'navy'], 'Shopee', 'tham trai san hoa van'],
  ['Blackout curtain 1m4 x 2m5', 'curtain', ['minimalism', 'scandinavian', 'vintage'], 230000, 140, 2, 250, ['beige', 'grey'], 'Tiki', 'rem cua chong nang'],
  ['Storage basket set (3)', 'storage', ['scandinavian', 'minimalism'], 175000, 35, 25, 25, ['natural'], 'Shopee', 'gio dung do set 3'],
  ['Under-bed storage box (2)', 'storage', ['minimalism', 'scandinavian', 'vintage'], 150000, 75, 45, 17, ['grey'], 'Tiki', 'hop dung do gam giuong'],
  ['Shoe rack 4-tier', 'storage', ['minimalism'], 190000, 60, 28, 80, ['white', 'black'], 'Shopee', 'ke giay 4 tang'],
  ['Full-length mirror 40x140', 'mirror', ['minimalism', 'scandinavian'], 330000, 40, 3, 140, ['black frame'], 'Shopee', 'guong dung toan than'],
  ['Round wall mirror 50cm', 'mirror', ['vintage', 'scandinavian'], 250000, 50, 3, 50, ['gold'], 'Tiki', 'guong tron treo tuong'],
  ['Bedside table 40cm', 'table', ['scandinavian', 'minimalism'], 260000, 40, 35, 50, ['light oak', 'white'], 'Shopee', 'tab dau giuong'],
  ['Low coffee table 60cm', 'table', ['scandinavian', 'vintage'], 380000, 60, 60, 40, ['walnut'], 'Tiki', 'ban tra sofa nho'],
  ['Used 1m2 bed frame (second-hand group)', 'bed', ['minimalism', 'vintage'], 600000, 120, 200, 45, ['wood'], 'Facebook Marketplace', 'giuong 1m2 cu'],
];
const cats = {};
const products = rows.map((r, i) => {
  const [name, category, styles, priceVnd, widthCm, depthCm, heightCm, colors, source, kw] = r;
  const id = 'p' + String(i + 1).padStart(3, '0');
  return { id, name, category, styles, priceVnd, widthCm, depthCm, heightCm, colors, source,
    sellerUrl: S(kw, source), imageUrl: null, inStock: true, updatedAt: '2026-11-03T00:00:00.000Z' };
});
fs.writeFileSync(__dirname + '/products.json', JSON.stringify(products, null, 2));
console.log(products.length, 'products');
