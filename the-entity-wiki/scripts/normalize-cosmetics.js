#!/usr/bin/env node

const {
  CONTENT_PATH,
  DATABASE_PATH,
  DISCOVERY_PATH,
  readJson,
  writeJson,
  buildAliases,
  slugify,
  normalizeKey,
  buildCharacterLookup
} = require('./cosmetics-shared');

const VALID_OUTFIT_LINK_MODES = new Set(['character_swap', 'linked', 'partially_linked', 'unlinked']);

const MANUAL_FULL_SET_ENTRIES = [
  {
    name: 'The Hell Priest',
    baseCharacterName: 'The Cenobite',
    baseCharacterType: 'Killer',
    groupKey: 'store',
    groupLabel: 'Store',
    collectionName: 'Hellraiser',
    sourceKind: 'manual-wiki-store',
    sourcePage: "Template:Cenobite's Body Store / Template:Cenobite's Weapon Store",
    sourceBucket: 'Store',
    pieceType: 'Outfit',
    outfitLinkMode: 'linked',
    boundSlots: ['Body', 'Weapon'],
    bindSummary: 'Body + Weapon',
    rarity: 'Very Rare',
    assetFileTitleCandidates: ['File:K25 outfit 006.png'],
    description: 'Explorer in the further regions of experience. Demons to some, angels to others.'
  },
  {
    name: 'Garment of Torment',
    baseCharacterName: 'The Cenobite',
    baseCharacterType: 'Killer',
    groupKey: 'store',
    groupLabel: 'Store',
    collectionName: 'Hellraiser',
    sourceKind: 'manual-wiki-store',
    sourcePage: "Template:Cenobite's Body Store",
    sourceBucket: 'Store',
    pieceType: 'Body',
    outfitLinkMode: 'unlinked',
    boundSlots: ['The Hell Priest'],
    bindSummary: 'The Hell Priest',
    rarity: 'Very Rare',
    assetFileTitleCandidates: ['File:K25 Body006.png'],
    description: 'Garment displaying intricate forms of body scarification to experiment with the limits of human sensations.'
  },
  {
    name: 'Grappling Hook & Chain',
    baseCharacterName: 'The Cenobite',
    baseCharacterType: 'Killer',
    groupKey: 'store',
    groupLabel: 'Store',
    collectionName: 'Hellraiser',
    sourceKind: 'manual-wiki-store',
    sourcePage: "Template:Cenobite's Weapon Store",
    sourceBucket: 'Store',
    pieceType: 'Weapon',
    outfitLinkMode: 'unlinked',
    boundSlots: ['The Hell Priest'],
    bindSummary: 'The Hell Priest',
    rarity: 'Very Rare',
    assetFileTitleCandidates: ['File:K25 W006.png'],
    description: 'The perverse hook & chain he wields with cruelty and satisfaction.'
  },
  {
    name: "Boogeyman's Robes",
    baseCharacterName: 'The Shape',
    baseCharacterType: 'Killer',
    groupKey: 'store',
    groupLabel: 'Store',
    collectionName: 'Haddonfield Nights',
    sourceKind: 'manual-wiki-store',
    sourcePage: "Template:Shape's Body Store",
    sourceBucket: 'Store',
    pieceType: 'Body',
    outfitLinkMode: 'unlinked',
    boundSlots: ['Escaped Patient'],
    bindSummary: 'Escaped Patient',
    rarity: 'Very Rare',
    assetFileTitleCandidates: ['File:MM Body02.png'],
    description: "The uniform of patients' of Smith's Grove Sanitarium, this one has been torn during a successful escape."
  },
  {
    name: 'First Cut',
    baseCharacterName: 'The Shape',
    baseCharacterType: 'Killer',
    groupKey: 'store',
    groupLabel: 'Store',
    collectionName: 'Haddonfield Nights',
    sourceKind: 'manual-wiki-store',
    sourcePage: "Template:Shape's Weapon Store",
    sourceBucket: 'Store',
    pieceType: 'Weapon',
    outfitLinkMode: 'unlinked',
    boundSlots: ['Escaped Patient'],
    bindSummary: 'Escaped Patient',
    rarity: 'Very Rare',
    assetFileTitleCandidates: ['File:MM W02 01.png'],
    description: 'The knife used during the 1963 murder of Judith Myers by his six-year-old brother, Michael Myers. The blade is still stained with blood.'
  }
];

function normalizePieceType(value = '') {
  const normalized = normalizeKey(value);
  if (!normalized) return 'Cosmetic';
  if (normalized.includes('outfit')) return 'Outfit';
  if (normalized.includes('head') || normalized.includes('hair') || normalized.includes('mask')) return 'Head';
  if (normalized.includes('body') || normalized.includes('torso')) return 'Body';
  if (normalized.includes('legs') || normalized.includes('pants')) return 'Legs';
  if (normalized.includes('weapon')) return 'Weapon';
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function createCharacterById(database) {
  return new Map([
    ...(database.killers || []).map((killer) => [killer.id, { ...killer, type: 'Killer' }]),
    ...(database.survivors || []).map((survivor) => [survivor.id, { ...survivor, type: 'Survivor' }])
  ]);
}

function resolveBaseCharacter(entry, characterLookup, characterById) {
  if (entry?.baseCharacterId && characterById.has(entry.baseCharacterId)) {
    return characterById.get(entry.baseCharacterId);
  }
  const fallbackName = normalizeKey(entry?.baseCharacterName || entry?.basePageTitle || '');
  if (fallbackName && characterLookup.has(fallbackName)) {
    return characterLookup.get(fallbackName);
  }
  if (entry?.baseCharacterId) {
    return {
      id: entry.baseCharacterId,
      name: entry.baseCharacterName || '',
      type: entry.baseCharacterType === 'Killer' ? 'Killer' : 'Survivor'
    };
  }
  return null;
}

function ensureUniqueId(baseId, usedIds) {
  let candidate = baseId || `cosmetic-${usedIds.size + 1}`;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function normalizeBoundSlots(slots) {
  return Array.isArray(slots)
    ? slots
      .filter(Boolean)
      .map((slot) => normalizePieceType(String(slot).trim()))
      .filter(Boolean)
    : [];
}

function resolveOutfitLinkMode(rawMode, fallbackSlots = [], fallbackMode = 'unlinked', pieceType = 'Cosmetic') {
  const normalized = String(rawMode || '').trim().toLowerCase();
  if (VALID_OUTFIT_LINK_MODES.has(normalized)) return normalized;
  if (pieceType !== 'Outfit') return 'unlinked';
  if (fallbackSlots.length >= 2) return 'linked';
  if (fallbackSlots.length === 1) return 'partially_linked';
  return fallbackMode;
}

function sanitizeCollectionName(rawCollectionName, fallbackCollectionName) {
  const raw = String(rawCollectionName || '').trim();
  if (!raw) return fallbackCollectionName;

  if (/^\d+px\]\]?$/i.test(raw)) return fallbackCollectionName;

  const cleaned = raw
    .replace(/\[\[File:[^\]]+\]\]/gi, ' ')
    .replace(/\b\d+px\]\]?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return fallbackCollectionName;
  return cleaned;
}

function mapCharacterSwap(entry, characterLookup, characterById, usedIds) {
  const resolvedBase = resolveBaseCharacter(entry, characterLookup, characterById);
  const baseSlug = slugify(resolvedBase?.name || entry.baseCharacterName || entry.basePageTitle || 'unknown');
  const id = ensureUniqueId(`${baseSlug}--${slugify(entry.name)}`, usedIds);
  const isPortraitException = entry.assetFileTitleCandidates?.[0] && !/(Head|Mask|Hair)/i.test(entry.assetFileTitleCandidates[0]);
  const status = !resolvedBase ? 'blocked_mapping' : (entry.assetFileTitleCandidates?.length ? 'ready' : 'blocked_art');
  const boundSlots = normalizeBoundSlots(entry.boundSlots);
  const outfitLinkMode = resolveOutfitLinkMode(entry.outfitLinkMode, boundSlots, 'character_swap', 'Outfit');
  return {
    id,
    name: entry.name,
    baseCharacterId: resolvedBase?.id || '',
    baseCharacterName: resolvedBase?.name || entry.baseCharacterName || '',
    baseCharacterType: resolvedBase?.type || entry.baseCharacterType || '',
    groupKey: entry.groupKey,
    groupLabel: entry.groupLabel,
    collectionName: 'Character swaps',
    image: `./dbd_images/cosmetics/character_swaps/${id}.png`,
    aliases: buildAliases(entry.name, [entry.groupLabel, 'character swap', 'character swaps', 'hud swap', entry.baseCharacterName]),
    sourceKind: entry.sourceKind,
    sourcePage: entry.sourcePage,
    assetProvenance: isPortraitException ? 'official-portrait-exception' : 'official-headshot',
    status,
    rarity: entry.groupLabel,
    outfitLinkMode,
    boundSlots,
    bindSummary: '',
    isLinkedSet: false,
    isCharacterSwap: true,
    pieceType: 'Outfit',
    sourceBucket: 'Character swaps',
    assetFileTitleCandidates: entry.assetFileTitleCandidates || [],
    description: `Character swaps outfit for ${resolvedBase?.name || entry.baseCharacterName || 'Unknown character'}`
  };
}

function mapFullSet(entry, characterLookup, characterById, usedIds) {
  const resolvedBase = resolveBaseCharacter(entry, characterLookup, characterById);
  const pieceType = normalizePieceType(entry.pieceType || 'Cosmetic');
  const boundSlots = normalizeBoundSlots(entry.boundSlots);
  const outfitLinkMode = resolveOutfitLinkMode(entry.outfitLinkMode, boundSlots, 'unlinked', pieceType);
  const isLinkedSet = pieceType === 'Outfit' && (outfitLinkMode === 'linked' || outfitLinkMode === 'partially_linked');
  const baseSlug = slugify(entry.baseCharacterName || entry.basePageTitle || 'unknown');
  const fileSlug = slugify(String(entry.assetFileTitleCandidates?.[0] || '').replace(/^File:/i, '').replace(/\.[a-z0-9]+$/i, '')) || 'icon';
  const nameSlug = slugify(entry.name || 'cosmetic');
  const pieceSlug = slugify(pieceType);
  const id = ensureUniqueId(`${baseSlug}--${nameSlug}--${pieceSlug}--${fileSlug}`, usedIds);
  const status = !resolvedBase ? 'blocked_mapping' : (entry.assetFileTitleCandidates?.length ? 'ready' : 'blocked_art');
  const bindSummary = entry.bindSummary ? String(entry.bindSummary) : (boundSlots.length ? boundSlots.join(' + ') : '');
  const collectionFallback = entry.sourceBucket || entry.groupLabel || 'Cosmetics';
  const collectionName = sanitizeCollectionName(entry.collectionName, collectionFallback);
  const groupKey = entry.groupKey ? String(entry.groupKey) : 'cosmetic';
  const groupLabel = entry.groupLabel ? String(entry.groupLabel) : 'Cosmetics';
  return {
    id,
    name: entry.name,
    baseCharacterId: resolvedBase?.id || '',
    baseCharacterName: resolvedBase?.name || entry.baseCharacterName || '',
    baseCharacterType: resolvedBase?.type || entry.baseCharacterType || '',
    groupKey,
    groupLabel,
    collectionName,
    image: `./dbd_images/cosmetics/full_sets/${id}.png`,
    aliases: buildAliases(entry.name, [
      collectionName,
      entry.groupLabel,
      entry.sourceBucket,
      pieceType,
      entry.baseCharacterName,
      ...boundSlots,
      outfitLinkMode.replace(/_/g, ' '),
      isLinkedSet ? 'linked outfit' : 'unlinked outfit'
    ]),
    sourceKind: entry.sourceKind,
    sourcePage: entry.sourcePage,
    assetProvenance: pieceType === 'Outfit' ? 'official-outfit-icon' : 'official-piece-icon',
    status,
    rarity: entry.rarity || '',
    outfitLinkMode,
    boundSlots,
    bindSummary,
    isLinkedSet,
    isCharacterSwap: false,
    pieceType,
    sourceBucket: entry.sourceBucket ? String(entry.sourceBucket) : '',
    assetFileTitleCandidates: entry.assetFileTitleCandidates || [],
    description: entry.description || `${pieceType} cosmetic for ${resolvedBase?.name || entry.baseCharacterName || 'Unknown character'}`
  };
}

function sortEntries(entries) {
  return [...entries].sort((a, b) =>
    a.baseCharacterType.localeCompare(b.baseCharacterType) ||
    a.baseCharacterName.localeCompare(b.baseCharacterName) ||
    (a.rarity || '').localeCompare(b.rarity || '') ||
    (a.pieceType || '').localeCompare(b.pieceType || '') ||
    a.groupLabel.localeCompare(b.groupLabel) ||
    (a.collectionName || '').localeCompare(b.collectionName || '') ||
    a.name.localeCompare(b.name)
  );
}

function mergePreservedExistingEntries(nextEntries, existingEntries = [], usedIds) {
  const nextIds = new Set(nextEntries.map((entry) => entry.id));
  const preservedEntries = existingEntries.filter((entry) => {
    if (!entry || typeof entry !== 'object' || !entry.id) return false;
    return !nextIds.has(entry.id);
  });

  preservedEntries.forEach((entry) => usedIds.add(entry.id));
  return sortEntries([...nextEntries, ...preservedEntries]);
}

function main() {
  const database = readJson(DATABASE_PATH);
  const discovery = readJson(DISCOVERY_PATH);
  const existingCatalog = readJson(CONTENT_PATH);
  const characterLookup = buildCharacterLookup(database);
  const characterById = createCharacterById(database);
  const usedIds = new Set();

  const discoveredCharacterSwaps = sortEntries((discovery.characterSwaps || []).map((entry) => mapCharacterSwap(entry, characterLookup, characterById, usedIds)));
  const discoveredFullSets = sortEntries([
    ...(discovery.fullSets || []),
    ...MANUAL_FULL_SET_ENTRIES
  ].map((entry) => mapFullSet(entry, characterLookup, characterById, usedIds)));
  const characterSwaps = mergePreservedExistingEntries(discoveredCharacterSwaps, existingCatalog.characterSwaps, usedIds);
  const fullSets = mergePreservedExistingEntries(discoveredFullSets, existingCatalog.fullSets, usedIds);
  const fullSetLinkModeCounts = fullSets.reduce((acc, entry) => {
    const key = entry.outfitLinkMode || 'unlinked';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const linkedFullSetCount = (fullSetLinkModeCounts.linked || 0) + (fullSetLinkModeCounts.partially_linked || 0);

  const cosmetics = {
    generatedAt: new Date().toISOString(),
    metadata: {
      sourceDiscoveryGeneratedAt: discovery.generatedAt || null,
      characterSwapCount: characterSwaps.length,
      fullSetCount: fullSets.length,
      cosmeticCount: fullSets.length,
      linkedFullSetCount,
      linkedCosmeticCount: linkedFullSetCount,
      fullSetLinkModeCounts,
      cosmeticLinkModeCounts: fullSetLinkModeCounts
    },
    characterSwaps,
    fullSets
  };

  writeJson(CONTENT_PATH, cosmetics);
  console.log(`normalize-cosmetics: wrote ${CONTENT_PATH}`);
  console.log(`normalize-cosmetics: characterSwaps=${characterSwaps.length} fullSets=${fullSets.length}`);
}

main();
