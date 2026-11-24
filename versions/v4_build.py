"""Builds the single-file index.html from src/ (run: python3 build.py)."""
import json, pathlib
root = pathlib.Path(__file__).parent
shell = (root / 'src/shell.html').read_text(encoding='utf-8')
core = (root / 'src/core.js').read_text(encoding='utf-8')
app = (root / 'src/app.js').read_text(encoding='utf-8')
preset = json.loads((root / 'studies/study3_ereaders.json').read_text(encoding='utf-8'))
preset_js = 'window.LAB_PRESET = ' + json.dumps(preset, ensure_ascii=False, indent=1) + ';'
out = shell.replace('/*CORE*/', core).replace('/*PRESET*/', preset_js).replace('/*APP*/', app)
assert '</script' not in core.replace('</script>', '') and '</script' not in app
(root / 'index.html').write_text(out, encoding='utf-8')
print('index.html', len(out), 'bytes')
