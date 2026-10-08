# Release fixtures

Frozen copies, taken on 2026-10-08 at version 2.8.0 (`APP_CACHE` `chitthi-app-v15`), of the five files a release
changes, for `release.test.mjs` (402 T070): `package.json`, `public/sw.js` → `sw.js`, `docker-compose.yml`,
`plugins/chitthi/.claude-plugin/plugin.json` → `plugin.json` and `CHANGELOG.md`. Don't update them when the real
files change: the tests' expected lines are worked out from these copies.
