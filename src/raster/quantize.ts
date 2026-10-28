import { toHex } from './color';
import type { RasterImage } from '../model/types';

const WHITE = 0xffffff;
const packed = (d: Uint8ClampedArray, i: number) =>
  d[i * 4 + 3] < 128 ? WHITE : (d[i * 4] << 16) | (d[i * 4 + 1] << 8) | d[i * 4 + 2];

/**
 * 量化：佔比 ≥ minShare（像素數夾在 4–64 之間）的顏色成為調色盤，依數量排序；
 * 其餘（反鋸齒中間色）歸到 RGB 距離最近的調色盤色；透明像素當白色。
 */
export function quantize(img: RasterImage, minShare = 5e-4): { palette: string[]; index: Uint16Array } {
  const n = img.width * img.height;
  const d = img.data;
  const counts = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const c = packed(d, i);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const threshold = Math.min(64, Math.max(4, n * minShare));
  const pal = [...counts.entries()]
    .filter(([, k]) => k >= threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => [(c >> 16) & 255, (c >> 8) & 255, c & 255]);
  const cache = new Map<number, number>();
  const nearest = (c: number) => {
    const hit = cache.get(c);
    if (hit !== undefined) return hit;
    const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    let best = 0, bd = Infinity;
    pal.forEach(([pr, pg, pb], i) => {
      const dd = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
      if (dd < bd) { bd = dd; best = i; }
    });
    cache.set(c, best);
    return best;
  };
  const index = new Uint16Array(n);
  for (let i = 0; i < n; i++) index[i] = nearest(packed(d, i));
  return { palette: pal.map(([r, g, b]) => toHex(r, g, b)), index };
}
