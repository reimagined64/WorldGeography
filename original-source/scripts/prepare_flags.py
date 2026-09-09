"""Rasterize consistent offline flag illustrations; no font file is bundled.

Optional maintenance tool, not required to build/run. Requires Pillow with
libraqm and a separately installed Noto Color Emoji font (tested: 2.051).
Existing data/flags.json and data/flags/*.png are sufficient for normal builds.
"""
from pathlib import Path
import argparse, base64, io, json
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[1]
def main():
    p=argparse.ArgumentParser()
    p.add_argument('--font',default='/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf')
    args=p.parse_args()
    font=ImageFont.truetype(args.font,109)
    countries=json.loads((ROOT/'data/countries.json').read_text())
    out=ROOT/'data/flags';out.mkdir(exist_ok=True)
    flags={}
    for c in countries:
        im=Image.new('RGBA',(160,145))
        text=''.join(chr(127397+ord(letter)) for letter in c['code'])
        ImageDraw.Draw(im).text((0,0),text,font=font,embedded_color=True)
        box=im.getbbox()
        if not box or box[2]-box[0]<40:raise ValueError(f'Missing flag: {c["code"]}')
        im=im.crop(box)
        b=io.BytesIO();im.save(b,format='PNG',optimize=True)
        (out/(c['code']+'.png')).write_bytes(b.getvalue())
        flags[c['code']]='data:image/png;base64,'+base64.b64encode(b.getvalue()).decode()
    (ROOT/'data/flags.json').write_text(json.dumps(flags,separators=(',',':')))
    print(f'Prepared {len(flags)} self-contained flag illustrations.')
if __name__=='__main__':main()
