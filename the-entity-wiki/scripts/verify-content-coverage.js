#!/usr/bin/env node
// Key-coverage check for extracted hand blocks.
// Fails if:
//  (R1) any database.json killer lacks a KILLER_GUIDES entry,
//  (R2) any database.json killer lacks a KILLER_STATS entry,
//  (R3) any new-style power item (internalId /^Item_K\d+Power$/) lacks a
//       POWER_MECHANICS entry (matched via normalized power item name ==
//       mechanics powerName), or any killer whose power item (joined via
//       addons killerName -> parents Item_K*Power) lacks mechanics.
//       Old-style Item_Slasher_* powers are only partially covered upstream
//       (15 mechanics entries vs 44 powers), so they are checked for orphan
//       consistency (R4) but not required to all have mechanics.
//  (R4) any POWER_MECHANICS entry's powerName does not match a real
//       database power item name (orphan mechanics, normalized),
//  (R5) META.gameVersion major.minor mismatches the game version mentioned
//       in CHANGELOG[0] (parsed from "Dead by Daylight X.Y[.Z]"; patch
//       bumps do not require a new changelog entry),
//  (R6) content/glossary.json fails to parse or has invalid section/item
//       structure.
//
// Name normalization (curly/straight apostrophes, NBSP, case) tolerates
// known upstream quirks, e.g. mechanics "Yamaoka's Haunting" vs database
// "Yamaoka’s Haunting", without editing the verbatim content files.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONTENT_ROOT = path.join(ROOT, 'content');

function readJson(rel) {
  const p = path.join(CONTENT_ROOT, rel);
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (error) {
    fail(`could not parse content/${rel}: ${error.message}`);
    return null;
  }
}

const issues = [];

function fail(message) {
  issues.push(message);
}

function normalizePowerName(value) {
  return String(value || '')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/‚/g, ',')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function main() {
  const database = readJson('database.json');
  const guides = readJson('killer-guides.json');
  const stats = readJson('killer-stats.json');
  const mechanics = readJson('power-mechanics.json');
  const meta = readJson('meta.json');
  const changelog = readJson('changelog.json');
  const glossary = readJson('glossary.json');

  if (issues.length) return report();

  const killers = Array.isArray(database.killers) ? database.killers : [];
  const powerItems = (Array.isArray(database.items) ? database.items : []).filter(
    (item) => item && item.type === 'power'
  );
  const powerByNormalizedName = new Map(powerItems.map((item) => [normalizePowerName(item.name), item]));
  const mechanicsByNormalizedPowerName = new Map(
    Object.values(mechanics || {}).map((entry) => [normalizePowerName(entry && entry.powerName), entry])
  );
  // Join killer -> power item via addons (killerName -> parents power internalId).
  const powerIdsByKiller = new Map();
  for (const addon of Array.isArray(database.addons) ? database.addons : []) {
    if (!addon || typeof addon.killerName !== 'string') continue;
    for (const parent of Array.isArray(addon.parents) ? addon.parents : []) {
      if (typeof parent !== 'string') continue;
      if (!powerIdsByKiller.has(addon.killerName)) powerIdsByKiller.set(addon.killerName, new Set());
      powerIdsByKiller.get(addon.killerName).add(parent);
    }
  }
  const powerByInternalId = new Map(powerItems.map((item) => [item.internalId, item]));

  // R1: every killer has a guide.
  for (const killer of killers) {
    if (!guides || !(killer.name in guides)) {
      fail(`killer "${killer.name}" lacks KILLER_GUIDES coverage.`);
    }
  }
  // Orphan guides.
  if (guides) {
    const killerNames = new Set(killers.map((k) => k.name));
    for (const name of Object.keys(guides)) {
      if (!killerNames.has(name)) {
        fail(`KILLER_GUIDES entry "${name}" has no matching database.json killer.`);
      }
    }
  }

  // R2: every killer has stats with required fields.
  for (const killer of killers) {
    const entry = stats ? stats[killer.name] : undefined;
    if (!entry || typeof entry.terrorRadius !== 'string' || typeof entry.speed !== 'string' || typeof entry.height !== 'string') {
      fail(`killer "${killer.name}" lacks KILLER_STATS coverage (terrorRadius/speed/height).`);
    }
  }
  if (stats) {
    const killerNames = new Set(killers.map((k) => k.name));
    for (const name of Object.keys(stats)) {
      if (!killerNames.has(name)) {
        fail(`KILLER_STATS entry "${name}" has no matching database.json killer.`);
      }
    }
  }

  // R3 + R4: power mechanics via Item_K*Power join + orphan check.
  const newStylePowers = powerItems.filter((item) => /^Item_K\d+Power$/.test(item.internalId || ''));
  for (const item of newStylePowers) {
    if (!mechanicsByNormalizedPowerName.has(normalizePowerName(item.name))) {
      fail(`power item "${item.internalId}" ("${item.name}") lacks POWER_MECHANICS coverage.`);
    }
  }
  // Killer -> power item (via addons) -> mechanics (only for new-style powers).
  for (const killer of killers) {
    const powerIds = powerIdsByKiller.get(killer.name);
    if (!powerIds) continue;
    for (const pid of powerIds) {
      if (!/^Item_K\d+Power$/.test(pid)) continue;
      const powerItem = powerByInternalId.get(pid);
      if (!powerItem) {
        fail(`killer "${killer.name}" references unknown power item "${pid}".`);
        continue;
      }
      if (!mechanicsByNormalizedPowerName.has(normalizePowerName(powerItem.name))) {
        fail(`killer "${killer.name}" lacks POWER_MECHANICS coverage via ${pid} ("${powerItem.name}").`);
      }
    }
  }
  // Orphan mechanics: every mechanics powerName must match a real power item (normalized).
  if (mechanics) {
    for (const [key, entry] of Object.entries(mechanics)) {
      if (!entry || typeof entry.powerName !== 'string' || !powerByNormalizedName.has(normalizePowerName(entry.powerName))) {
        fail(`POWER_MECHANICS key "${key}" has powerName "${entry && entry.powerName}" with no matching database power item.`);
      }
      if (!Array.isArray(entry.mechanics) || !entry.mechanics.length) {
        fail(`POWER_MECHANICS key "${key}" must have a non-empty mechanics array.`);
      }
    }
  }

  // R5: META.gameVersion vs CHANGELOG[0] game version (major.minor).
  if (meta && Array.isArray(changelog) && changelog.length) {
    const gameVersion = meta.gameVersion;
    if (typeof gameVersion !== 'string' || !/^\d+\.\d+(\.\d+)?$/.test(gameVersion.trim())) {
      fail(`content/meta.json gameVersion "${gameVersion}" is not a valid version.`);
    } else {
      const first = changelog[0];
      const text = Array.isArray(first.changes) ? first.changes.join('\n') : '';
      const match = text.match(/Dead by Daylight\s+(\d+)\.(\d+)(?:\.(\d+))?/);
      if (!match) {
        fail('CHANGELOG[0] does not mention a Dead by Daylight X.Y[.Z] game version.');
      } else {
        const metaParts = String(gameVersion).trim().split('.').map(Number);
        const logMajor = Number(match[1]);
        const logMinor = Number(match[2]);
        if (metaParts[0] !== logMajor || metaParts[1] !== logMinor) {
          fail(`META.gameVersion "${gameVersion}" mismatches CHANGELOG[0] game version "${match[0].replace(/^Dead by Daylight\s+/, '')}" (major.minor).`);
        }
      }
    }
  } else {
    if (!meta) fail('content/meta.json is missing.');
    if (!Array.isArray(changelog) || !changelog.length) fail('content/changelog.json must be a non-empty array.');
  }

  // R6: glossary parses + structure.
  if (!Array.isArray(glossary)) {
    fail('content/glossary.json must be a JSON array of sections.');
  } else {
    const seenTerms = new Set();
    glossary.forEach((section, index) => {
      const label = `content/glossary.json section #${index + 1}`;
      if (!section || typeof section !== 'object' || Array.isArray(section)) {
        fail(`${label} is not an object.`);
        return;
      }
      if (typeof section.section !== 'string' || !section.section.trim()) {
        fail(`${label} field "section" must be a non-empty string.`);
      }
      if (!Array.isArray(section.items) || !section.items.length) {
        fail(`${label} field "items" must be a non-empty array.`);
        return;
      }
      section.items.forEach((item, itemIndex) => {
        const itemLabel = `${label} item #${itemIndex + 1}`;
        if (!item || typeof item !== 'object') {
          fail(`${itemLabel} is not an object.`);
          return;
        }
        if (typeof item.term !== 'string' || !item.term.trim()) {
          fail(`${itemLabel} field "term" must be a non-empty string.`);
          return;
        }
        if (typeof item.def !== 'string' || !item.def.trim()) {
          fail(`${itemLabel} field "def" must be a non-empty string.`);
          return;
        }
        if (seenTerms.has(item.term)) {
          fail(`glossary term "${item.term}" is duplicated.`);
        }
        seenTerms.add(item.term);
      });
    });
  }

  return report();
}

function report() {
  if (issues.length) {
    console.error('verify-content-coverage: FAILED');
    issues.forEach((message) => console.error(`- ${message}`));
    process.exit(1);
  }
  console.log('verify-content-coverage: all key coverage checks passed.');
}

main();
