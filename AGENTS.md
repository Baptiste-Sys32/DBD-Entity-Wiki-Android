# AGENTS.md - DBD app (projet-perso-dbdapp)

> Applies ONLY when cwd is inside `projet-perso-dbdapp/`.
> Global `~/AGENTS.md` still applies. On conflict, global security/safety wins, otherwise this file wins.
> Sibling repo: `projet-perso-dbdsite-deploy/` (site, source of truth). See its AGENTS.md when porting.

## 0. Scope

- Work in DBD app + site repos only. Never touch R6 or other game repos unless explicitly asked.
- Role of this repo: app second. When a change spans site + app, the site implements first; port here only after the site is live-checked.

## 1. Workflow

- Map before doing (game updates): check the site's sync/map report first. Wait for user go-ahead before implementing.
- No unasked work. Do exactly what was asked. Stop and ask rather than expanding scope.
- No release builds unasked. Never rebuild the AAB, bump versions, or push deploys without an explicit request.

## 2. Porting from site

- Data-only imports. Copy data only (content JSON, generated bundles, images, meta/changelog). Never port UI, engine, or native code unless asked.

## 3. Visual changes

- For visual/embed work (favicons, covers, art): render previews into `~/Downloads/` and wait for approve/deny before touching the repo.
