# Update

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
