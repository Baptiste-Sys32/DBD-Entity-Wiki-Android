# DBD Entity Wiki Android

The Entity's Wiki as an Android app. Dead by Daylight companion: perks, items, add-ons, guides, all stored on the device, works offline. Same web frontend as the site, bundled into a native shell with Capacitor.

## Project Structure

* `the-entity-wiki/` - the app itself: `web/` frontend bundle, `android/` Capacitor project.
* `api/` - scraping tools and data archives used to refresh content.
* `assets/` - shared art and icons.

Content flows one way. The website repo is the source of truth and this repo only takes data updates. No UI work happens here.

## License

PolyForm Noncommercial 1.0.0. See [LICENSE](LICENSE).
