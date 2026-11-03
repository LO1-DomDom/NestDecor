const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// js-yaml does not expand YAML merge keys (`<<: *anchor`) by default, so expand them here.
function expandMerge(node) {
  if (Array.isArray(node)) return node.map(expandMerge);
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === '<<') continue;
      out[k] = expandMerge(v);
    }
    if (node['<<']) return { ...expandMerge(node['<<']), ...out };
    return out;
  }
  return node;
}

function loadSpec() {
  const raw = yaml.load(fs.readFileSync(path.join(__dirname, 'openapi.yaml'), 'utf8'));
  return expandMerge(raw);
}

module.exports = { loadSpec };
