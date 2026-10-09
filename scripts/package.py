#!/usr/bin/env python3
"""Build a repeatable, store-ready ZIP with manifest.json at archive root."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCES = [
    'LICENSE-FLUENT-ICONS.txt',
    'manifest.json', 'newtab.html', 'style.css', 'newtab.js',
    'query-analyzer.js', 'suggestions.js', 'candidate-pipeline.js',
    'frecency.js', 'bookmarks.js', 'boot.js', 'site-icons.js',
]
SOURCES += [p.relative_to(ROOT).as_posix() for folder in ('assets', 'icons', '_locales')
            for p in sorted((ROOT / folder).rglob('*')) if p.is_file()]


def validate(expected_version=None):
    manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
    version = manifest['version']
    if manifest.get('manifest_version') != 3 or not re.fullmatch(r'\d+\.\d+\.\d+(?:\.\d+)?', version):
        raise ValueError('Expected Manifest V3 and numeric extension version')
    if expected_version and version != expected_version.removeprefix('v'):
        raise ValueError(f'Tag {expected_version} does not match manifest version {version}')
    if manifest.get('default_locale') not in ('zh_CN', 'en'):
        raise ValueError('Expected a supported default_locale')
    for locale in ('zh_CN', 'en'):
        loc_path = ROOT / '_locales' / locale / 'messages.json'
        messages = json.loads(loc_path.read_text(encoding='utf-8'))
        for field in ('name', 'description'):
            key = manifest[field].removeprefix('__MSG_').removesuffix('__')
            if manifest[field] != f'__MSG_{key}__' or key not in messages or not messages[key].get('message'):
                raise ValueError(f'Missing localized {field} in {locale}')
    html = (ROOT / manifest['chrome_url_overrides']['newtab']).read_text(encoding='utf-8')
    referenced = re.findall(r'<script[^>]+src="([^"]+)"|<link[^>]+href="([^"]+)"', html)
    required = [manifest['chrome_url_overrides']['newtab'], *manifest['icons'].values()]
    required += [value.lstrip('/') for tup in referenced for value in tup if value and not value.startswith(('http:', 'https:', 'data:'))]
    unlisted_js = {p.name for p in ROOT.glob('*.js')} - {p for p in SOURCES if p.endswith('.js')}
    if unlisted_js:
        raise ValueError(f'New JavaScript files must be included in the package allowlist: {sorted(unlisted_js)}')
    missing = [p for p in dict.fromkeys([*SOURCES, *required]) if not (ROOT / p).is_file()]
    if missing:
        raise FileNotFoundError(f'Missing runtime resources: {missing}')
    return version


def build(expected_version=None):
    version = validate(expected_version)
    output_dir = ROOT / 'dist'
    output_dir.mkdir(exist_ok=True)
    output = output_dir / f'minimal-new-tab-v{version}-edge.zip'
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for filename in sorted(set(SOURCES)):
            info = zipfile.ZipInfo(filename, date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, (ROOT / filename).read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    with zipfile.ZipFile(output) as archive:
        assert archive.testzip() is None
        assert archive.namelist()[0] != 'minimal-new-tab/'
        assert 'manifest.json' in archive.namelist()
        assert len(archive.namelist()) == len(SOURCES)
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    checksum_path = output.with_suffix('.zip.sha256')
    checksum_path.write_text(f'{digest}  {output.name}\n', encoding='utf-8')
    print(f'Created {output.relative_to(ROOT)} ({output.stat().st_size} bytes)')
    print(f'SHA256 {digest}')
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--version', help='Expected git tag such as v1.5.11')
    args = parser.parse_args()
    build(args.version)
