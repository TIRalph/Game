#!/usr/bin/env python3
"""
Screenshots e capas para a página do jogo (itch.io, Game Jolt etc.) a partir dos quadros do trailer.

Uso: python3 tools/trailer/make_stills.py <pasta-da-gravacao> <pasta-de-saida> [pasta-das-artes]
(as artes vêm de: node tools/trailer/record.cjs <pasta> 1920 1080 --keyart)
Escolhe quadros por cena (shots.json) e gera:
  screenshot-*.png (1920x1080), capa-630x500.png (capa do itch.io), banner-1920x480.png
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# (cena, posição relativa dentro da cena, nome do arquivo)
PICKS = [
    ('aparo', 0.62, 'aparo'),
    ('esquiva', 0.30, 'esquiva-perfeita'),
    ('mago', 0.55, 'mago-cadeia-de-raios'),
    ('tempestade', 0.45, 'mago-tempestade'),
    ('punhos', 0.45, 'punhos-cem-punhos'),
    ('flechas', 0.6, 'chuva-de-flechas'),
    ('chefe', 0.5, 'chefe-arauto'),
    ('mestre', 0.85, 'mestre-rafael'),
    ('arvore', 0.6, 'arvore-de-habilidades'),
    ('sino', 0.7, 'mosteiro'),
]


def font(size, bold=True):
    for path in ['/usr/share/fonts/truetype/inter/InterDisplay-Black.ttf', '/usr/share/fonts/opentype/inter/InterDisplay-Black.otf']:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    import subprocess
    p = subprocess.run(['fc-match', '-f', '%{file}', 'Inter Display:style=Black' if bold else 'Inter'], capture_output=True, text=True).stdout
    return ImageFont.truetype(p, size)


def frame_path(folder, idx):
    return os.path.join(folder, 'frames', f'{idx:05d}.jpg')


def nearest_frame(folder, idx):
    for d in range(0, 30):
        for i in (idx + d, idx - d):
            if os.path.exists(frame_path(folder, i)):
                return frame_path(folder, i)
    return None


def title(img, text, size, pos, sub=None, sub_size=None):
    d = ImageDraw.Draw(img)
    f = font(size)
    shadow = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ds = ImageDraw.Draw(shadow)
    ds.text((pos[0] + 4, pos[1] + 6), text, font=f, fill=(0, 0, 0, 200))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(8)))
    # gradiente branco -> lilás no texto
    bbox = d.textbbox(pos, text, font=f)
    grad = Image.new('RGBA', img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(bbox[1], bbox[3] + 1):
        k = (y - bbox[1]) / max(1, bbox[3] - bbox[1])
        gd.line([(bbox[0], y), (bbox[2], y)], fill=(int(255 - 86 * k), int(255 - 99 * k), 255, 255))
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).text(pos, text, font=f, fill=255)
    img.paste(grad, (0, 0), mask)
    if sub:
        fs = font(sub_size or size // 4, bold=False)
        d.text((pos[0] + 3, bbox[3] + size * 0.25), sub, font=fs, fill=(220, 214, 255, 255))


def main():
    folder, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    info = json.load(open(os.path.join(folder, 'shots.json')))
    shots = {s['id']: s for s in info['shots']}
    made = []
    for sid, rel, name in PICKS:
        if sid not in shots:
            continue
        s = shots[sid]
        p = nearest_frame(folder, s['start'] + int(rel * (s['frames'] - 1)))
        if not p:
            continue
        img = Image.open(p).convert('RGB')
        dst = os.path.join(out, f'screenshot-{len(made) + 1:02d}-{name}.png')
        img.save(dst, optimize=True)
        made.append((name, img))
        print(dst)

    # Artes limpas (sem HUD), se existirem
    art = {}
    if len(sys.argv) > 3:
        for k in ('arauto', 'mago', 'mosteiro', 'forja'):
            p = os.path.join(sys.argv[3], f'keyart-{k}.png')
            if os.path.exists(p):
                art[k] = Image.open(p).convert('RGB')
                art[k].save(os.path.join(out, f'arte-{k}.png'), optimize=True)

    # Capa 630x500 (itch.io) e banner, a partir das melhores cenas
    by = dict(made)
    base = art.get('arauto') or by.get('chefe-arauto') or by.get('aparo') or made[0][1]
    W, H = base.size
    crop_w = int(H * 630 / 500)
    cx = W // 2
    cover = base.crop((cx - crop_w // 2, 0, cx + crop_w // 2, H)).resize((630, 500), Image.LANCZOS).convert('RGBA')
    shade = Image.new('RGBA', cover.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shade)
    for y in range(500):
        a = int(max(0, (y - 250) / 250) * 210)
        sd.line([(0, y), (630, y)], fill=(6, 5, 12, a))
    cover.alpha_composite(shade)
    title(cover, 'ECO DA', 64, (34, 352))
    title(cover, 'LÂMINA', 64, (34, 412))
    cover.convert('RGB').save(os.path.join(out, 'capa-630x500.png'))

    banner_src = art.get('mago') or by.get('punhos-cem-punhos') or base
    bw, bh = banner_src.size
    band = banner_src.crop((0, int(bh * 0.25), bw, int(bh * 0.25) + int(bw * 480 / 1920))).resize((1920, 480), Image.LANCZOS).convert('RGBA')
    shade = Image.new('RGBA', band.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shade)
    for x in range(1920):
        a = int(max(0, 1 - x / 1100) * 220)
        sd.line([(x, 0), (x, 480)], fill=(6, 5, 12, a))
    band.alpha_composite(shade)
    title(band, 'ECO DA LÂMINA', 112, (90, 150), 'APARE.  ESQUIVE.  LEMBRE.', 34)
    band.convert('RGB').save(os.path.join(out, 'banner-1920x480.png'))
    print('capa e banner prontos')


if __name__ == '__main__':
    main()
