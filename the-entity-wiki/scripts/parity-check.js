#!/usr/bin/env node
// Cross-repo content parity check: app repo <-> site repo.
// Compares canonical content semantically (timestamps and whitespace-only
// differences are ignored), so rebuild churn does not fail the gate.
//
// Usage:
//   node scripts/parity-check.js --peer <path-to-other-repo>/the-entity-wiki \
//     [--json review/parity-report.json]
//
// Exit codes: 0 = parity (warnings allowed), 1 = content drift, 2 = usage/config error.
//
// Design notes:
// - content/meta.json + content/changelog.json are repo-specific by design
//   (appVersion vs siteVersion keys); only gameVersion is compared.
// - web/index.html is intentionally forked (app shell vs site articles) and is
//   never compared. Shared data must travel via content/*.json + web/*.js.
// - web/*.js bundles are compared by parsing their `var NAME` payloads with
//   vm and deep-comparing semantically (never by hash, never by rebuild).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const LOCAL_ROOT = path.resolve(__dirname, '..');

// Timestamp / volatile keys ignored everywhere (rebuild churn, not content).
const VOLATILE_KEYS = new Set(['generatedAt', 'fetchedAt', 'sourceDiscoveryGeneratedAt', 'lastChecked', 'checkedAt']);

// Pure-data content files compared semantically. Missing on either side = drift.
const CONTENT_FILES = [
  'content/database.json',
  'content/community-content.json',
  'content/cosmetics.json',
  'content/timeline.json',
  'content/perk-description-report.json',
  'content/addon-description-report.json',
  'content/killer-guides.json',
  'content/killer-stats.json',
  'content/power-mechanics.json',
  'content/glossary.json',
  'content/premade-builds.json',
  'content/achievements.json',
];

// Bundles compared by vm-parsed payload (var name -> global name).
const BUNDLE_FILES = [
  ['web/data.js', 'DATABASE'],
  ['web/lore.js', 'TIMELINE_DATA'],
  ['web/cosmetics.js', 'COSMETICS_CATALOG'],
  ['web/community-content.js', 'COMMUNITY_CONTENT'],
  ['web/meta.js', 'META'],
  ['web/changelog.js', 'CHANGELOG'],
  ['web/guides.js', null], // multi-export: { KILLER_GUIDES, KILLER_STATS, POWER_MECHANICS }
  ['web/glossary.js', 'GLOSSARY'],
  ['web/premade-builds.js', 'PREMADE_BUILDS'],
  ['web/achievements.js', 'DBD_ACHIEVEMENTS'],
  ['web/worldle-data.js', 'WORLDLE_DATA'],
];

function usageError(message) {
  console.error(`parity-check: ${message}`);
  console.error('Usage: node scripts/parity-check.js --peer <path-to-other-the-entity-wiki> [--json review/parity-report.json]');
  process.exit(2);
}

function parseArgs(argv) {
  let peer = null;
  let jsonOut = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--peer') peer = argv[++i];
    else if (argv[i] === '--json') jsonOut = argv[++i];
    else usageError(`unknown argument: ${argv[i]}`);
  }
  if (!peer) usageError('--peer <path> is required.');
  return { peer: path.resolve(peer), jsonOut };
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (VOLATILE_KEYS.has(key)) continue;
      out[key] = normalize(value[key]);
    }
    return out;
  }
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim();
  return value;
}

function stableStringify(value) {
  return JSON.stringify(normalize(value));
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadJsGlobal(filePath, globalName) {
  const code = fs.readFileSync(filePath, 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  if (globalName) {
    vm.runInContext(`${code}\nthis.__parity = ${globalName};`, sandbox, { filename: filePath });
    return sandbox.__parity;
  }
  vm.runInContext(`${code}\nthis.__parity = module.exports;`, sandbox, { filename: filePath });
  return sandbox.__parity;
}

// database.json gets a targeted diff: roster counts + per-id description drift.
function diffDatabase(local, peer) {
  const drifts = [];
  for (const key of ['killers', 'survivors', 'perks', 'items', 'offerings', 'addons', 'maps', 'realms']) {
    const a = Array.isArray(local[key]) ? local[key] : [];
    const b = Array.isArray(peer[key]) ? peer[key] : [];
    if (a.length !== b.length) {
      drifts.push(`${key} count: local=${a.length} peer=${b.length}`);
    }
  }
  const byId = (arr) => {
    const m = new Map();
    for (const e of arr || []) m.set(e.id || e.name, e);
    return m;
  };
  for (const key of ['perks', 'addons']) {
    const a = byId(local[key]);
    const b = byId(peer[key]);
    const divergent = [];
    for (const [id, ea] of a) {
      const eb = b.get(id);
      if (!eb) {
        if (divergent.length < 20) divergent.push(`${ea.name || id} (missing on peer)`);
        continue;
      }
      for (const field of ['description', 'descriptionPost95', 'name']) {
        if (stableStringify(ea[field]) !== stableStringify(eb[field])) {
          if (divergent.length < 20) divergent.push(`${ea.name || id} field ${field}`);
          break;
        }
      }
    }
    for (const [id, eb] of b) {
      if (!a.has(id) && divergent.length < 20) divergent.push(`${eb.name || id} (missing locally)`);
    }
    if (divergent.length) drifts.push(`${key} divergent (${divergent.length} shown max 20): ${divergent.join('; ')}`);
  }
  return drifts;
}

function main() {
  const { peer, jsonOut } = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(peer) || !fs.statSync(peer).isDirectory()) {
    usageError(`peer dir not found: ${peer}`);
  }

  const drifts = [];
  const warnings = [];
  const compared = [];

  for (const rel of CONTENT_FILES) {
    const aPath = path.join(LOCAL_ROOT, rel);
    const bPath = path.join(peer, rel);
    const aExists = fs.existsSync(aPath);
    const bExists = fs.existsSync(bPath);
    if (!aExists && !bExists) {
      warnings.push(`${rel}: missing on both sides, skipped.`);
      continue;
    }
    if (!aExists || !bExists) {
      drifts.push(`${rel}: missing ${!aExists ? 'locally' : 'on peer'}.`);
      continue;
    }
    compared.push(rel);
    if (rel === 'content/database.json') {
      for (const d of diffDatabase(loadJson(aPath), loadJson(bPath))) drifts.push(`${rel}: ${d}`);
    } else if (stableStringify(loadJson(aPath)) !== stableStringify(loadJson(bPath))) {
      drifts.push(`${rel}: semantic content differs.`);
    }
  }

  // meta.json: repo-specific version keys by design; only gameVersion must match.
  for (const rel of ['content/meta.json']) {
    const aPath = path.join(LOCAL_ROOT, rel);
    const bPath = path.join(peer, rel);
    if (fs.existsSync(aPath) && fs.existsSync(bPath)) {
      compared.push(`${rel} (gameVersion only)`);
      const a = loadJson(aPath);
      const b = loadJson(bPath);
      if ((a.gameVersion || '').trim() !== (b.gameVersion || '').trim()) {
        drifts.push(`${rel}: gameVersion differs (local=${a.gameVersion} peer=${b.gameVersion}).`);
      }
    } else {
      warnings.push(`${rel}: not present on both sides yet (repo-specific versions), skipped.`);
    }
  }
  if (fs.existsSync(path.join(LOCAL_ROOT, 'content/changelog.json')) !== fs.existsSync(path.join(peer, 'content/changelog.json'))) {
    warnings.push('content/changelog.json: present on one side only (repo-specific), skipped.');
  }

  // Bundles: compare only where present on both sides; app-only new bundles are noted.
  for (const [rel, globalName] of BUNDLE_FILES) {
    const aPath = path.join(LOCAL_ROOT, rel);
    const bPath = path.join(peer, rel);
    const aExists = fs.existsSync(aPath);
    const bExists = fs.existsSync(bPath);
    if (!aExists && !bExists) continue;
    if (!aExists || !bExists) {
      warnings.push(`${rel}: present ${aExists ? 'locally only' : 'on peer only'} (pending wiring), skipped.`);
      continue;
    }
    compared.push(rel);
    let aVal;
    let bVal;
    try {
      aVal = loadJsGlobal(aPath, globalName);
    } catch (e) {
      drifts.push(`${rel}: failed to parse locally (${e.message}).`);
      continue;
    }
    try {
      bVal = loadJsGlobal(bPath, globalName);
    } catch (e) {
      drifts.push(`${rel}: failed to parse on peer (${e.message}).`);
      continue;
    }
    if (stableStringify(aVal) !== stableStringify(bVal)) {
      drifts.push(`${rel}: bundle payload differs semantically.`);
    }
  }

  const report = { compared, drifts, warnings };
  if (jsonOut) {
    const outPath = path.resolve(LOCAL_ROOT, jsonOut);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`parity-check: wrote ${path.relative(LOCAL_ROOT, outPath)}`);
  }

  for (const w of warnings) console.log(`parity-check warning: ${w}`);
  console.log(`parity-check: compared ${compared.length} files.`);
  if (drifts.length) {
    console.error(`parity-check: DRIFT (${drifts.length}):`);
    for (const d of drifts.slice(0, 20)) console.error(`  - ${d}`);
    if (drifts.length > 20) console.error(`  ... and ${drifts.length - 20} more.`);
    process.exit(1);
  }
  console.log('parity-check: parity OK.');
}

main();
