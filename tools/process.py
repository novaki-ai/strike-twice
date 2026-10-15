#!/usr/bin/env python3
"""Turn raw varlik outputs (assets-raw/) into game-ready assets (public/assets/)."""
import os, sys, json, math
from PIL import Image, ImageFilter, ImageDraw, ImageChops

RAW = 'assets-raw/img'
OUT = 'public/assets/img'
os.makedirs(OUT, exist_ok=True)
os.makedirs(OUT + '/icons', exist_ok=True)

def despill(im):
    """Remove magenta key-color spill from semi-transparent edge pixels."""
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    a = im.getchannel('A')
    # pixels near transparency: erode alpha to find edge band
    edge = a.filter(ImageFilter.MinFilter(5))
    ep = edge.load()
    for y in range(h):
        for x in range(w):
            r, g, b, al = px[x, y]
            if al == 0:
                continue
            if al < 250 or ep[x, y] < 250:
                k = min(r, b) - g
                if k > 0:
                    r -= k; b -= k
                    px[x, y] = (r, g, b, al)
    return im

def fit(im, maxw, maxh):
    im = im.copy()
    bbox = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    s = min(maxw / im.width, maxh / im.height, 1.0)
    if s < 1:
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    return im

def save_webp(im, path, q=88):
    im.save(path, 'WEBP', quality=q, method=6)

def sprite(name, maxw, maxh, out=None, q=88):
    src = os.path.join(RAW, name + '.png')
    if not os.path.exists(src):
        print('missing', src); return None
    im = despill(Image.open(src))
    im = fit(im, maxw, maxh)
    path = os.path.join(OUT, (out or name) + '.webp')
    save_webp(im, path, q)
    print(f'{name}: {im.size} -> {path} ({os.path.getsize(path)//1024}KB)')
    return im

def tile(name, size=512, out=None):
    src = os.path.join(RAW, name + '.png')
    if not os.path.exists(src):
        print('missing', src); return
    im = Image.open(src).convert('RGB')
    # center crop square
    s = min(im.size)
    im = im.crop(((im.width - s)//2, (im.height - s)//2, (im.width - s)//2 + s, (im.height - s)//2 + s))
    im = im.resize((size, size), Image.LANCZOS)
    # make seamless: blend original (center weight) with half-offset copy (edge weight)
    off = ImageChops.offset(im, size // 2, size // 2)
    mask = Image.new('L', (size, size))
    mp = mask.load()
    for y in range(size):
        for x in range(size):
            dx = abs(x - size / 2) / (size / 2)
            dy = abs(y - size / 2) / (size / 2)
            d = max(dx, dy)
            # 1 in center -> 0 at edges
            v = max(0.0, min(1.0, (1.0 - d) / 0.45))
            v = v * v * (3 - 2 * v)
            mp[x, y] = int(v * 255)
    res = Image.composite(im, off, mask)
    path = os.path.join(OUT, (out or name) + '.webp')
    res.save(path, 'WEBP', quality=85, method=6)
    print(f'tile {name} -> {path} ({os.path.getsize(path)//1024}KB)')

def picture(name, w, h, q=82, out=None):
    src = os.path.join(RAW, name + '.png')
    if not os.path.exists(src):
        print('missing', src); return
    im = Image.open(src).convert('RGB')
    im = im.resize((w, h), Image.LANCZOS) if im.size != (w, h) else im
    path = os.path.join(OUT, (out or name) + '.webp')
    im.save(path, 'WEBP', quality=q, method=6)
    print(f'pic {name} -> {path} ({os.path.getsize(path)//1024}KB)')

def components(im, min_area=400):
    """Find separate blobs in an RGBA sheet (by alpha), merging nearby fragments."""
    a = im.getchannel('A').point(lambda v: 255 if v > 30 else 0)
    # dilate so small detached bits (sparks, drops) join their parent object
    dil = a.filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.MaxFilter(15))
    w, h = dil.size
    px = dil.load()
    seen = bytearray(w * h)
    boxes = []
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            if px[x, y] and not seen[y * w + x]:
                # flood fill (iterative)
                stack = [(x, y)]
                seen[y * w + x] = 1
                x0 = x1 = x; y0 = y1 = y; area = 0
                while stack:
                    cx, cy = stack.pop()
                    area += 1
                    if cx < x0: x0 = cx
                    if cx > x1: x1 = cx
                    if cy < y0: y0 = cy
                    if cy > y1: y1 = cy
                    for nx, ny in ((cx+1, cy), (cx-1, cy), (cx, cy+1), (cx, cy-1)):
                        if 0 <= nx < w and 0 <= ny < h and px[nx, ny] and not seen[ny * w + nx]:
                            seen[ny * w + nx] = 1
                            stack.append((nx, ny))
                if area >= min_area:
                    boxes.append((x0, y0, x1 + 1, y1 + 1, area))
    return boxes

def sheet(name, names, maxw, maxh, outdir=OUT, prefix=''):
    """Slice a generated sprite sheet into separate sprites, ordered row-major."""
    src = os.path.join(RAW, name + '.png')
    if not os.path.exists(src):
        print('missing', src); return
    im = despill(Image.open(src))
    boxes = components(im)
    boxes.sort(key=lambda b: -b[4])
    boxes = boxes[:len(names)]
    # row-major ordering: cluster by y center
    boxes.sort(key=lambda b: (b[1] + b[3]) / 2)
    rows = []
    for b in boxes:
        cy = (b[1] + b[3]) / 2
        if rows and abs(rows[-1][0] - cy) < im.height * 0.12:
            rows[-1][1].append(b)
        else:
            rows.append([cy, [b]])
    ordered = []
    for _, r in rows:
        ordered += sorted(r, key=lambda b: b[0])
    print(f'sheet {name}: found {len(ordered)} parts for {len(names)} names')
    for nm, b in zip(names, ordered):
        part = im.crop(b[:4])
        part = fit(part, maxw, maxh)
        path = os.path.join(outdir, prefix + nm + '.webp')
        save_webp(part, path)
    return ordered

def grid_sheet(name, names, maxw, maxh, outdir=OUT, prefix='', cols=3, rows=3):
    """Slice a sheet laid out on a regular grid: crop each cell to its content."""
    src = os.path.join(RAW, name + '.png')
    if not os.path.exists(src):
        print('missing', src); return
    im = despill(Image.open(src))
    cw, ch = im.width / cols, im.height / rows
    for i, nm in enumerate(names):
        cx, cy = i % cols, i // cols
        cell = im.crop((int(cx * cw), int(cy * ch), int((cx + 1) * cw), int((cy + 1) * ch)))
        boxes = components(cell, 50)
        if boxes:
            big = max(b[4] for b in boxes)
            keep = [b for b in boxes if b[4] >= big * 0.12]
            mask = Image.new('L', cell.size, 0)
            d = ImageDraw.Draw(mask)
            for b in keep:
                d.rectangle(b[:4], fill=255)
            a = ImageChops.multiply(cell.getchannel('A'), mask)
            cell.putalpha(a)
        part = fit(cell, maxw, maxh)
        save_webp(part, os.path.join(outdir, prefix + nm + '.webp'))
    print(f'grid {name}: {len(names)} parts')

if __name__ == '__main__':
    which = sys.argv[1:] or ['all']
    exec(open('tools/assets_list.py').read())
