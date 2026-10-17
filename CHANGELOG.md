# Changelog

This file summarizes user-facing changes. Versions marked Unreleased describe pending changes; released versions correspond to published GitHub tags.

## 1.5.15 — Unreleased

- Unify the search journey around typing, Tab cycling and Enter: show a stable default action, skip it on the first forward cycle, keep input focus/text intact, and preserve Arrow-key alternatives.
- Make the engine trigger consistently open its menu in both search scopes, unwind suggestions before leaving site search on Escape, and match pointer-submit behavior to the keyboard's selected destination. Keep bookmark completion and guard first-use IME composition during lazy loading.
- Preserve rapid Tab intentions while local suggestions load; cancel pending selection on editing, dismissal, blur or scope changes, without waiting for remote suggestions.
- Add temporary site search via `@site` or suggestion actions, with a site tag, keyboard picker and Esc / × exit. Keep the default engine unchanged and isolate site suggestions/history from general online suggestions.
- Bundle community-maintained Kagi Bangs rules with MIT attribution, local-first caching and daily background updates. Pin Raw/CDN downloads to the same revision, validate before replacement, preserve caches on failure and deduplicate checks across tabs.
- Show a subtle keyboard-hint footer; Right Arrow accepts inline completion from the first matching suggestion, including bookmark titles and URL prefixes, while Enter confirms the highlighted action.
- Show the actual cached Bing image on its background card, refresh it after successful updates, and retain it when changing modes or going offline.
- Cap the background grid at three visible rows, scroll all cards together, and put new uploads before the bundled images. Limit imported images to 50 with clear overflow feedback.
- Keep background settings open when the file picker is cancelled.
- Unify every background source in one card grid; include four offline WebP backgrounds (alpine dawn, northern lights, dunes, coast).
- Reuse existing glass, buttons, icons and motion easing for panel entry/exit, card hover/selection and gallery changes. Closing background settings keeps the settings menu closed.

- Add a unified wallpaper manager with thumbnail browsing, multi-image uploads and batch deletion; uploading no longer applies the image. Remove remote image URLs and broad optional host permissions. Existing single-image data is not migrated.
- Crossfade decoded wallpaper images, retain good Bing caches on failures, show update/source information, and recheck on date changes, visibility and connectivity recovery.
- Cover wallpaper storage, failure/race paths, completion interaction and Bing lifecycle with Chromium integration tests.
- Stabilize wallpaper regressions by waiting for displayed images and checking completed state without fixed animation timing assertions.

## 1.5.14 — Released

- Prevent suggestion rows from jittering on backspace: keep stale rows inert until replacement, remove duplicate exit ghosts, and limit per-query row animation batches.
- Add Chromium regression coverage for rapidly deleted search queries, unchanged row identity, and motion count.

## 1.5.13 — Released

- Start each new tab with its bookmark sidebar closed instead of restoring the previous tab's sidebar state.
- Track deliberate bookmark-sidebar visits as local ranking feedback, using the same URL identity as search suggestions.
- Add privacy-safe rank-stage and score diagnostics for tuning search-first suggestions.
- Add bilingual Issue templates for bugs and feature requests.

## 1.5.12 — Released

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
