# Update

Date: 2026-09-06

## App Polish & Accessibility Pass (5.34.0, post-sync)

Quality pass on `web/index.html` after the Chorus of Sin sync. Full smoke test (8/8 scenarios) and offline-runtime verification pass.

Fixes:

- **Hardware back button is now modal-aware**: pressing back closes the topmost overlay (map layout → character profile → power → lore → perk sheet → compare modal) before navigating views; previously it navigated behind open modals and could exit the app with a modal still open.
- **Rules-of-hooks violation fixed** in `CharacterProfileModal` (the `if (!character) return null` guard moved below all hooks; derived values null-guarded).
- **Native `alert()`/`confirm()` (14 call sites) replaced** with a styled in-app dialog (`showAppDialog`/`appAlert`/`appConfirm` helpers): Escape/Enter keys, danger styling for destructive confirmations, focused confirm button. Used by build share/delete, match delete, Chaos Shuffle validation, and backup copy/restore flows.
- **localStorage save failures are now visible**: `saveToStorage` dispatches `dbd-storage-save-error`; the app shows a transient warning banner instead of failing silently (private browsing / quota-full).
- **Dead `animate-in` classes fixed**: the Play CDN build lacks `tailwindcss-animate`, so 8 view entrances silently rendered nothing; the utilities (`animate-in`, `fade-in`, `slide-in-from-bottom-4`) are now defined against the existing `fadeIn` keyframes plus a new `viewSlideEnter`.
- **Cold start**: `LAUNCH_OVERLAY_MIN_MS` reduced from 2000 ms to 400 ms (the 2 s floor existed to mask the Babel compile; keep it small until the Vite migration lands).
- **Images**: `AssetFrame` now renders with `loading="lazy"` + `decoding="async"`.
- **Contrast**: all 50 `text-zinc-600` text uses bumped to `text-zinc-400` (was ~2.9:1 on dark, fails WCAG AA).
- **A11y**: `role="dialog"` + `aria-modal` + labels on all six overlays (character profile, lore, power, map layout, perk compare, perk bottom sheet); `aria-label="Close"` on icon-only close buttons; "clear search" buttons labeled; mobile nav touch targets raised to 44px min.
- Fixed the stale loading-screen tip copy ("1 in 14" → "1 in 17", matching the actual tip count).

### Modernization Plan (planned — not started)

Agreed follow-up project; do **after** the site's own polish pass so both UIs migrate together where possible.

1. **Vite + precompiled React + Tailwind CLI** (biggest win): split the 14.6k-line `index.html` into modules; JSX compiles at build time — removes the 2.9 MB Babel runtime, the ~12.5 MB per-launch parse, and the splash entirely; enables minification and code splitting (lazy-load the 5.6 MB cosmetics bundle). Keep `smoke-test.py` as the regression gate on the built output.
2. **Extract hand-maintained data blocks** (`KILLER_GUIDES`, `KILLER_STATS`, `POWER_MECHANICS`, `GLOSSARY`, `CHANGELOG`, `PREMADE_BUILDS`, achievements) into `content/*.json` compiled by `build-data.js` — kills the drift class of bugs (the "Executioner (Tokyo Ghoul)" orphan) and stops per-chapter hand-editing of HTML; add a key-coverage check to `check:data`.
3. **Capacitor 5 → 7** after the Vite split: proper Android 15/16 edge-to-edge + keyboard handling (delete the manual 34px nav-offset fudge), current plugin APIs.
4. **Optional PWA/service worker**: versioned data bundles fetched+cached on Wi-Fi so content updates can ship without a full Play release (the app is already 100% offline-capable, zero runtime fetches today).
5. **ESLint (+ react-hooks) + Prettier + a real CI workflow** running `check:data`, `test:smoke`, and lint on every push (replace the disabled content-guardrails stub).
6. Deferred by choice: converting the 399 MB cosmetics asset pack from `install-time` to on-demand Play Asset Delivery (revisit before the next Play release; ~550 MB first download today).

---

Date: 2026-09-06

## Full Sync — Chapter 41: Chorus of Sin (patch 10.1.0)

Synced both data layers to the August 25, 2026 chapter (first community-created chapter, no new map).

- `npm run sync:catalog-updates` pulled The Judgment (K44, `Item_K44Power`), Aurora Stardotter (S54), 6 perks, the Will of the Gods power item, and 20 add-ons; 28 wiki images downloaded.
- Fixed the missing `Magnetized Manacles` add-on icon manually: the wiki hosts it under the British spelling `T_UI_iconAddon_MagnetisedManacles.png` (the add-on page is "Magnetised Manacles"). Saved locally as `iconaddon_magnetizedmanacles.png`.
- Extended `scripts/normalize-images.js` `KILLER_POWER_ITEM_TO_KILLER` with `Item_K43Power: 'The Slasher'` and `Item_K44Power: 'The Judgment'` (the map previously ended at K42).
- Ran `npm run sync:all-updates:full` end-to-end: descriptions (10.1.0 perk balance changes), community content, map layouts, game icons, offering fixes, full cosmetics re-sync (4,347 ready sets, 0 blocked), build-data, and every verifier green.
- Added `chorus-of-sin` (chapter 41, Aug 25, 2026) to `content/timeline.json` with The Judgment and Aurora Stardotter fog entries.
- Hand-maintained `web/index.html` updates: META (app 5.34.0 / game 10.1.0 / synced September 6, 2026), CHANGELOG entry, `KILLER_GUIDES` + `KILLER_STATS` + `POWER_MECHANICS` entries for The Judgment, and a `the_slasher_950` backfill for The Slasher. Updated `web/worldle-data.js` (aliases, gender, emoji clues).
- Bumped `android/app/build.gradle` to versionCode 46 / versionName 5.34.0.
- Legacy `api/` layer: extended `dbd_mega_scraper.py` `POWER_TO_KILLER` with K42/K43/K44 (K43+ use the new `Item_K43Power`-style convention) and added `T_UI_iconPerks` / `T_UI_iconsPerks` / `T_UI_iconAddon` / `T_UI_iconItems` wiki prefixes to the image pass (new- generation icons were invisible to the old `IconPerks`/`IconAddon`-only scan). Regenerated `api/dbd_data.json` (44 killers, 54 survivors, 321 perks, 946 add-ons) and refreshed `api/dbd_images`.
- Mirrored everything to the site repo (`projet-perso-dbdsite-deploy`): content, bundles, images, `sync-catalog-updates.js` (was missing there entirely), the `sync-map-layouts.js` File polyfill, `package.json` script entry, META strings (was 9.6.0 / April 30), and site-side `KILLER_GUIDES`/`KILLER_STATS` additions for The Slasher + The Judgment.

Verification passed (both repos):

```text
npm run check:data
node scripts/verify-offline-runtime.js
```

Notes:

- Tricky.lol counts differ slightly from the curated DB by design: 60 maps / 21 realms / 125 offerings in the API include upcoming/unreleased and alternate entries; the canonical DB keeps 57 maps / 20 realms / 123 offerings.
- The legacy `api/dbd_data.json` layer keeps raw `{Tunable.*}` tokens and tricky.lol image URLs by its own convention (all 321 perks, old and new) — only the canonical pipeline resolves tokens.
- No new map shipped with this chapter, so `MAP_LAYOUTS` and `scrape_map_layouts.py` were untouched.

---

Date: 2026-06-23

## Timeline Sync — Chapter 40 / The Life Road

Finished the 10.0.0 sync by adding the two missing timeline entries that were not included in the June 18 catalog sync.

- Added `chapter-40` ("Dead by Daylight: Jason", June 16, 2026) to `content/timeline.json` with The Slasher / Jason Voorhees (licensed, K43) and the correct chapter number and fog-entry lore.
- Added `the-life-road` ("The Life Road", June 25, 2026) to `content/timeline.json` with Shane Wiigwaas (unlicensed, S53) and a fog-entry derived from his canonical lore.
- Rebuilt all four runtime web bundles (`web/data.js`, `web/lore.js`, `web/cosmetics.js`, `web/community-content.js`) via `node scripts/build-data.js`.

Verification passed:

```text
node scripts/build-data.js --check
node scripts/verify-data-contracts.js
node scripts/verify-perk-descriptions.js
node scripts/verify-teachables.js
node scripts/verify-offline-runtime.js
```

Notes:

- The 6 new perks (K43P01–K43P03, S53P01–S53P03) were already correctly stored from the June 18 catalog sync. `sync-descriptions` confirms all six are `same_as_legacy` (the API description matches the stored legacy description, so no `descriptionPost95` field is needed or added — this is the expected state for brand-new perks whose descriptions have not yet been revised by BHVR post-9.5).
- No `releaseDate` or `chapter` fields were added to `content/database.json` — `timeline.json` is the canonical source for release history; `database.json` only tracks gameplay and lore data.

---

Date: 2026-06-18

## 10.0.0 Jason / Catalog Sync

Updated the app to the current DBD 10.0.0 data/changelog window using the local sync pipeline plus a new catalog importer for source records the old pipeline only counted but did not insert.

- Added The Slasher, Shane Wiigwaas, 6 unique perks, The Slasher's power item, and 20 Slasher add-ons to the canonical database.
- Downloaded local offline assets for new character portraits, perk icons, the Slasher power icon, and add-on icons.
- Ran the full asset sync first, refreshing game icons and cosmetics; cosmetics now cover 110 character swaps and 4,159 full-set entries with 4,269 ready assets and 0 blocked assets.
- Added `scripts/sync-catalog-updates.js` and wired it into `sync:all-updates` so future new API catalog records are imported before description validation.
- Updated Worldle metadata for The Slasher and app metadata to 5.33.0 / game version 10.0.0.

Validation passed:

```text
npm run sync:all-updates:full
npm run sync:all-updates:fast
node scripts/verify-offline-runtime.js
```

Sources checked:

- Official BHVR 10.0.0 Jason Patch Notes.
- Official BHVR PTB-to-live Slasher changes.
- DBD public API and officially recognised DBD Wiki asset pages.

---

Date: 2026-04-30

## 9.6.0 Mid-Season Sync

Updated the app to the live DBD 9.6.0 patch using the local sync pipeline.

- Refreshed Otz community content, map-layout metadata, game icons, perk/add-on reports, and runtime web bundles.
- Scraped the current cosmetics wiki inventory and expanded cosmetics coverage to 103 character swaps and 4,136 full-set entries.
- Downloaded 105 new cosmetic assets and refreshed the Android full-set cosmetic asset pack.
- Applied official 9.6.0 overrides for Fast Track, affected killer add-ons, and Blight's 4.4 m/s movement speed because the public description API had not fully caught up yet.
- Updated app metadata to 5.30.0 / game version 9.6.0.

Validation passed:

```text
node scripts/normalize-images.js --check
node scripts/build-data.js --check
node scripts/audit-cosmetics.js
node scripts/verify-teachables.js
node scripts/verify-perk-descriptions.js
node scripts/verify-data-contracts.js
node scripts/verify-offline-runtime.js
python3 scripts/smoke-test.py
npm run android:copy
npm run android:prepare-release-assets
```

Sources checked:

- Official 9.6.0 notes via BHVR/SteamDB.
- Officially recognised DBD Wiki patch page.
- Otzdarva public resource pages.

---

Date: 2026-04-17

## Perk Description Rendering Fix

The killer-card perk slide-up view was showing unresolved post-9.5.0 description tokens for some killer perks, for example:

```text
{Tunable.K40P02.AuraRevealDuration}s
{Tunable.K40P02.Cooldown}s
```

The issue was in the data sync pipeline, not the slide-up renderer. The slide-up correctly rendered `descriptionPost95`, but some synced post-9.5.0 descriptions still contained raw API template tokens.

## Root Cause

`scripts/sync-descriptions.js` only handled older placeholder formats, such as positional tokens and exact simple keys. The current perk API also returns named template tokens, including:

- `{Tunable...}`
- `{Keyword...}`
- `{Input...}`

Those tokens were not resolved before writing `descriptionPost95` into `content/database.json` and the generated runtime bundle.

## What Changed

- Updated `scripts/sync-descriptions.js` to resolve named tunable, keyword, and input tokens.
- Regenerated canonical and runtime data:
  - `content/database.json`
  - `web/data.js`
- Added verification so unresolved named post-9.5.0 tokens now fail checks.
- Updated the fallback perk manifest pipeline to reject unresolved named tokens as well.
- Fixed one fallback manifest entry for Clairvoyance where `{Input.UseItem}` needed readable text.

## Result

Phantom Fear now resolves in the runtime bundle as:

```text
Whenever a Survivor within your Terror Radius looks at you, they scream, then you see their Aura for 2s. Cooldown: 80/70/60s.
```

The runtime bundle was checked for unresolved named tokens and returned `0` remaining matches.

## Verification

The following checks passed:

```text
node scripts/build-data.js --check
node scripts/verify-perk-descriptions.js
node scripts/verify-data-contracts.js
node scripts/verify-offline-runtime.js
python3 scripts/smoke-test.py
```

The smoke test passed all 8 scenarios, including the killer profile flow.

## Notes

- No runtime fetching was added.
- `web/data.js` was regenerated from the canonical content source.
- The old `NEXT_STEPS.md` handoff checklist was replaced by this update file.
