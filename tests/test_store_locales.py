"""Store metadata and packaged language resources."""
import json
from pathlib import Path
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def test_localized_manifest_and_package():
    manifest = json.loads((ROOT / 'manifest.json').read_text())
    assert manifest['default_locale'] in ('zh_CN', 'en')
    assert manifest['name'] == '__MSG_extensionName__'
    assert manifest['description'] == '__MSG_extensionDescription__'
    for locale in ('zh_CN', 'en'):
        messages = json.loads((ROOT / '_locales' / locale / 'messages.json').read_text())
        assert set(messages) == {'extensionName', 'extensionDescription'}
        for entry in messages.values():
            assert len(entry['message']) < 132
    subprocess.run([sys.executable, 'scripts/package.py', '--version', 'v' + manifest['version']],
                   check=True, cwd=ROOT, capture_output=True)
    archive = ROOT / 'dist' / f"minimal-new-tab-v{manifest['version']}-edge.zip"
    with zipfile.ZipFile(archive) as z:
        for locale in ('zh_CN', 'en'):
            path = f'_locales/{locale}/messages.json'
            assert path in z.namelist()
            assert json.loads(z.read(path))
        assert z.testzip() is None
