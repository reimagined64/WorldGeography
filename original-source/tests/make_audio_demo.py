"""Render all 21 themes with the live synthesis code; requires Playwright and FFmpeg."""
from pathlib import Path
import argparse, base64, json, os, shutil, subprocess, tempfile, wave
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]

def main() -> None:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=ROOT/'tests/answering-music-v6.mp3')
    args=parser.parse_args()
    if not shutil.which('ffmpeg'):
        raise SystemExit('FFmpeg není dostupný v PATH. Je potřeba pouze pro vytvoření MP3 ukázky.')
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
        try:
            page=browser.new_page();page.set_content('<html lang="cs"><title>Audio render test</title></html>')
            for script in ['core.js','audio.js']:
                page.add_script_tag(content=(ROOT/'src'/script).read_text(encoding='utf-8'))
            result=page.evaluate((ROOT/'tests/render_audio.js').read_text(encoding='utf-8'))
        finally:
            browser.close()
    if result['clipped'] or result['peak']>=.95 or any(m['rms']<=.001 for m in result['markers']):
        raise RuntimeError('Zvuková kontrola neprošla: clipping nebo chybějící signál.')
    if len({m['themeIndex'] for m in result['markers']})!=21:
        raise RuntimeError('Ukázka neobsahuje všech 21 motivů.')
    pcm=base64.b64decode(result.pop('data'))
    args.output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='wg-audio-') as folder:
        wav=Path(folder)/'themes.wav'
        with wave.open(str(wav),'wb') as f:
            f.setnchannels(1);f.setsampwidth(2);f.setframerate(result['sampleRate']);f.writeframes(pcm)
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(wav),'-codec:a','libmp3lame','-q:a','3','-metadata','title=World Geography 6 — 21 soutěžních motivů',str(args.output)],check=True)
    (ROOT/'tests/audio-demo-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:result[k] for k in ['duration','notes','peak','rms','clipped']},ensure_ascii=False))
    print(args.output)

if __name__=='__main__':
    main()
