"""Build a completely standalone HTML file. Standard-library Python only."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
def main():
    template=(ROOT/'src/index.template.html').read_text(encoding='utf-8')
    for tag,file in {'NOTICES':'data/embedded-notices.txt','CSS':'src/style.css','CORE':'src/core.js','CLOCK':'src/clock.js','AUDIO':'src/audio.js','GLOBE':'src/globe.js','APP':'src/app.js','COUNTRIES':'data/countries.json','FLAGS':'data/flags.json','MAP':'data/map.json','SOURCES':'data/sources.json'}.items():
        text=(ROOT/file).read_text(encoding='utf-8')
        if file.endswith('.json'):text=json.dumps(json.loads(text),ensure_ascii=False,separators=(',',':')).replace('</','<\\/')
        template=template.replace('/*__'+tag+'__*/',text)
    if '/*__' in template:raise RuntimeError('Unreplaced template marker')
    (ROOT/'index.html').write_text(template,encoding='utf-8')
    print(f'Built {ROOT / "index.html"} ({len(template.encode()):,} bytes)')
if __name__=='__main__':main()
