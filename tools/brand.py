"""Regenerates every asset derived from brand/. Run: python tools/brand.py
Needs Pillow and numpy. Output is committed, so the build itself stays dependency free.

Why premultiplied: the transparent logo PNG stores pure black (0,0,0) under every alpha=0 pixel.
A plain resize averages that black into the edge pixels and leaves a dark halo. Resizing premultiplied
colour, then dividing alpha back out, keeps the edge colour equal to the mark colour."""
import json, numpy as np
from PIL import Image

SRC = 'brand/LOGO HIDON PNG...png'          # transparent mark
LIME = (204, 255, 0)                         # sampled, see src/styles/tokens.css
OUT = 'src/assets/'

im = Image.open(SRC).convert('RGBA')
a = np.array(im).astype(np.float64)
alpha = a[..., 3] / 255.0
ys, xs = np.where(alpha > 0.02)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
side = max(x1 - x0, y1 - y0); pad = int(side * 0.06); side += pad * 2
cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
box = (cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)
crop = a[box[1]:box[3], box[0]:box[2]]
print('mark bbox', (x0, y0, x1, y1), 'crop', box, 'side', side)

def premul_resize(arr, n):
    al = arr[..., 3:4] / 255.0
    pm = np.concatenate([arr[..., :3] * al, arr[..., 3:4]], axis=2)
    chans = [Image.fromarray(pm[..., i].astype(np.float32), mode='F').resize((n, n), Image.LANCZOS) for i in range(4)]
    out = np.stack([np.array(c) for c in chans], axis=2)
    A = np.clip(out[..., 3], 0, 255)
    rgb = np.where(A[..., None] > 0.5, out[..., :3] / np.maximum(A[..., None] / 255.0, 1e-6), 0)
    return np.concatenate([np.clip(rgb, 0, 255), A[..., None]], axis=2)

def save(arr, path):
    Image.fromarray(np.round(arr).astype(np.uint8), 'RGBA').save(path, optimize=True)

for n in (64, 128, 256, 512):
    r = premul_resize(crop, n)
    save(r, f'{OUT}mark-ink-{n}.png')
    lime = r.copy(); lime[..., :3] = LIME
    save(lime, f'{OUT}mark-lime-{n}.png')

# Favicon: 88x88 alpha grid of the mark, traced as horizontal runs. One grid cell = 0.25 viewBox units.
G = 88
g = premul_resize(crop, G)[..., 3] >= 127.5
runs = []
for y in range(G):
    x = 0
    while x < G:
        if g[y, x]:
            s = x
            while x < G and g[y, x]: x += 1
            runs.append(f'M{s} {y}h{x - s}v1h-{x - s}z')
        else: x += 1
path = ''.join(runs)
tpl = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">'
       '<rect width="32" height="32" rx="7" fill="{{bg}}"/>'
       f'<g transform="translate(5 5) scale(0.25)" fill="{{{{fg}}}}"><path d="{path}"/></g></svg>\n')
assert '--' not in tpl
open('src/favicon.svg.tpl', 'w').write(tpl)
print('favicon path bytes', len(path), 'cells', int(g.sum()))
