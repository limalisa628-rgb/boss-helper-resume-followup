"""Package only verified extension output and Git-tracked source; never private data."""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT).strip():
    raise SystemExit('Commit or resolve the source working tree before packaging a versioned release.')
OUTPUT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / '.tools' / 'release'
BUILD = ROOT / '.output' / 'chrome-mv3'
VERSION = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
manifest = json.loads((BUILD / 'manifest.json').read_text(encoding='utf-8'))
assert manifest['version'] == VERSION and 'key' not in manifest
assert '实验版' in manifest['name']
for file in BUILD.rglob('*'):
    if file.is_file() and file.suffix in ('.js', '.html', '.json'):
        text = file.read_text(encoding='utf-8')
        assert 'synthetic fixture' not in text and 'FollowupBrowserFixture' not in text and 'demo-account' not in text, file

OUTPUT.mkdir(parents=True, exist_ok=True)
name = f'boss-helper-resume-followup-{VERSION}'
unpacked = OUTPUT / f'{name}-chrome'
if unpacked.exists():
    raise SystemExit(f'Refusing to replace an existing unpacked release: {unpacked}')
shutil.copytree(BUILD, unpacked)
assert (unpacked / 'UPSTREAM-LICENSE.txt').is_file()
extension_zip = OUTPUT / f'{name}-chrome.zip'
with zipfile.ZipFile(extension_zip, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(unpacked.rglob('*')):
        if file.is_file():
            archive.write(file, file.relative_to(unpacked).as_posix())

tracked = subprocess.check_output(['git', 'ls-files', '--recurse-submodules', '-z'], cwd=ROOT).decode('utf-8').split('\0')
source_zip = OUTPUT / f'{name}-source.zip'
with zipfile.ZipFile(source_zip, 'w', zipfile.ZIP_DEFLATED) as archive:
    for relative in tracked:
        if not relative:
            continue
        path = ROOT / relative
        assert not any(part in {'.git', '.tools', '.superpowers', 'node_modules', '.output', 'private-resumes', 'followup-exports'} for part in Path(relative).parts), relative
        if path.is_file():
            archive.write(path, f'{name}/{relative}')

report = {
    'version': VERSION,
    'commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True, encoding='utf-8').strip(),
    'status': 'experimental-local-rules-and-limit-fix',
    'real_boss_pdf_integration_verified': False,
    'installed_in_chrome': False,
    'artifacts': [{'file': path.name, 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()} for path in (extension_zip, source_zip)],
}
(OUTPUT / 'release-integrity.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
