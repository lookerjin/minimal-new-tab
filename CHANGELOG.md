# Changelog

This file summarizes user-facing changes. Tags represent released builds; the versions below document pre-release iterations until the first tag is published.

## 1.5.13 — Unreleased

- Start each new tab with its bookmark sidebar closed instead of restoring the previous tab's sidebar state.
- Track deliberate bookmark-sidebar visits as local ranking feedback, using the same URL identity as search suggestions.
- Add privacy-safe rank-stage and score diagnostics for tuning search-first suggestions.
- Add bilingual Issue templates for bugs and feature requests.

## 1.5.12 — Edge listing readiness candidate (unreleased)

- Localize extension name and short description for Chinese and English in Manifest V3.
- Include locales in deterministic release ZIP and add metadata validation.
- Prepare public privacy policy, bilingual store listing and certification notes.

## 1.5.11 — Candidate for first Edge release

- Stabilize mixed asynchronous search candidates to avoid repeated suggestion panel expansion during backspace.
- Unify search and direct URL navigation feedback, with bilingual input placeholder.
- Add subtle loading arc around the engine capsule on submission.
- Fix settings synchronization and wallpaper cache race conditions.
- Refine suggestion panel animation and settings controls.

Prior iteration notes remain in Git history and the existing README until the documentation is consolidated.
