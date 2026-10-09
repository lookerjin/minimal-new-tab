# Release process

**GitHub is the only official build and release source.** Source code changes go through a PR, pass CI, and merge into the protected `main` branch. The release version is read from `manifest.json` (`MAJOR.MINOR.PATCH`); no local ZIP is uploaded to the Edge store.

## Release with one click (recommended)

1. Update `manifest.json` and `CHANGELOG.md` in a PR. Wait for the PR CI to pass; merge to `main`.
2. Confirm the `main` CI is green.
3. Open [Actions → Release](https://github.com/lookerjin/minimal-new-tab/actions/workflows/release.yml) and choose **Run workflow**, with **Branch: main**.
4. Wait for the full release workflow to succeed. The reusable CI workflow reruns all checks and builds the extension ZIP once. The publish job downloads that *tested* artifact, verifies its checksum and manifest, automatically creates an annotated tag matching the manifest version, and creates a GitHub Release with the original ZIP and `.sha256`.
5. Download the **GitHub Release** ZIP to submit it to Microsoft Edge Add-ons Partner Center. The first listing is submitted manually as `Hidden`; the workflow does not submit it to Microsoft.
6. After Edge approval, verify the store-installed extension and `chrome.storage.sync` on another Edge desktop profile/device. IndexedDB local-image wallpapers do not sync.
7. Change the same listing to `Public` only when ready for public distribution.

Do **not** create tags or Releases manually in the normal workflow. The release job uses `contents: write` for publishing; CI uses only `contents: read`.

## Safety and retries

- Manual release is permitted **only from the latest commit of `main`**. Feature branches and stale `main` commits are rejected.
- The release name/tag must exactly match `manifest.json`. A tag cannot be moved to another commit, and an existing GitHub Release is never replaced.
- Multiple release runs are serialized by a concurrency group.
- If a run fails **after its tag was created but before the GitHub Release**, rerunning the workflow at the same `main` commit can complete the missing Release; it does not recreate or move the tag.
- The original `v*` push trigger remains supported for exceptional manual tag-based releases; it still validates the commit and package. Tags pushed using `GITHUB_TOKEN` do **not** trigger an additional workflow run, so the one-click workflow completes publication itself.
- If the repository's Actions permissions restrict `GITHUB_TOKEN`, enable permission to write repository contents for this workflow. The job explicitly requests `contents: write`.
- Do not silently change the extension's store identity: an extension installed under another ID may leave local data behind.

## Updating the Edge store later

Subsequent Microsoft Store updates remain manual for now. A separate Edge Add-ons Update REST API workflow can be added after the store item exists, with credentials in Actions secrets and a protected environment. Repository source visibility and Edge Add-ons `Hidden` / `Public` are separate choices.

## Local checks

```sh
node --test tests/search-core.test.cjs
python -m pip install -r requirements-test.txt
python -m playwright install chromium
python -m pytest -q tests/test_search_ui.py
python scripts/package.py --version v1.5.12
```

Browser tests use mock extension APIs; they do not replace real Edge store-install acceptance.
