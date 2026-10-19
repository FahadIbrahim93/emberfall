# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- One best-run dossier shared across boards, pilot profiles and the public mirror (#14). Merged to main; not live until the rollout is announced.

## 2026-10-19

### Fixed
- Portal build fails loudly when `dist-portal.zip` is not created, with a python3 fallback when `zip` is missing (#13).

### Added
- Portal-mode build for web game portals: `npm run build:portal` writes `dist-portal.zip`. Enabled by `window.EMBERFALL_PORTAL` or `?portal=1` (#11).

### Security
- Pinned framed decks, closed the notes read, hardened the Vercel mirror (#10).
