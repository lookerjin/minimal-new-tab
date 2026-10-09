# Release process

- `main` is the only release source. Feature branches are integrated via pull requests.
- `manifest.json` is the single source of truth for the extension version (`MAJOR.MINOR.PATCH`).
- Tags are annotated in the format `vMAJOR.MINOR.PATCH`, matching the manifest.
- CI tests each PR and `main` update, then builds an Edge Store ZIP with `manifest.json` at its root.
- Tag pushes run CI again, verify that the tag commit belongs to `main`, verify the manifest version, and publish a GitHub Release with the ZIP and SHA-256 checksum.
- **No automatic Microsoft Store submission** in this phase. The first Hidden listing must be created and reviewed in Partner Center. Future updates may use the Edge Add-ons Update REST API after credentials and a product ID are available.

## First release checklist

1. Merge the current tested feature branch into `main` through a PR. Verify CI is green.
2. Confirm the extension version in `manifest.json`, and update `CHANGELOG.md`.
3. On the latest release commit on `main`, create and push an annotated tag:

   ```sh
   git switch main
   git pull --ff-only
   git tag -a v1.5.11 -m 'Release v1.5.11'
   git push origin v1.5.11
   ```

4. Watch the `Release` workflow. It runs tests and publishes `minimal-new-tab-v1.5.11-edge.zip` plus `.sha256` in GitHub Releases.
5. Download that exact asset for Partner Center. For the **initial** Edge listing, upload manually and choose `Hidden` availability.
6. After approval, verify official-store installation, updates and `chrome.storage.sync` behavior on a second Edge desktop profile/device. Local IndexedDB images do not sync.
7. Switch the same listing to `Public` after product metadata, screenshots, privacy policy and support contact are ready.

## Later updates

- Change code and increment the manifest version in a PR.
- Merge after CI passes. Create the matching annotated tag on main.
- The same GitHub Release workflow produces the upload package.
- Upload manually, or later activate a **separately approved** workflow using the Edge update API.
- Do not place API keys in the repo. When automation is added, use GitHub Actions secrets and an environment with reviewers.

## Local checks

```sh
node --test tests/search-core.test.cjs
python -m pip install -r requirements-test.txt
python -m playwright install chromium
python -m pytest -q tests/test_search_ui.py
python scripts/package.py --version v1.5.11
```

Browser tests load a mocked extension page; they are not a substitute for an installed Edge acceptance test.

## Safety notes

- An annotated tag and GitHub Release establish the shipped source version. Avoid moving or reusing tags after publication.
- Repository source visibility (private/public) is a separate decision from Edge Add-ons `Hidden`/`Public` discoverability.
- Do not silently replace the extension's store identity: reinstalling from a different extension ID can leave local data behind.
