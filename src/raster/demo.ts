/** 三張範例圖（640×360），與 prototype v3 逐像素相同；只在沒有輸入時用 */
import { KNOWN_MATERIALS, fromHex } from './color';
import type { RasterImage } from '../model/types';

const W = 640, H = 360;
const C = Object.fromEntries(KNOWN_MATERIALS.map((m) => [m.name, m.fill])) as Record<string, string>;

/** X-Cut：沿通道，3 根 gate（HfO₂ / TiN / Poly 堆疊）+ spacer + W 接觸；一處 45° 斜邊帶反鋸齒 */
export function demoX(): RasterImage {
  const d = new Uint8ClampedArray(W * H * 4);
  const rect = (x0: number, y0: number, x1: number, y1: number, hex: string) => {
    const [r, g, b] = fromHex(hex);
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y++)
      for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
        const p = (y * W + x) * 4;
        d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255;
      }
  };
  rect(0, 0, W, H, C.Air);
  const surf = 230;
  rect(0, surf, W, H, C['Si (p)']);
  const gates = [120, 320, 520];
  const Lg = 60, sp = 18, tox = 5, hk = 6, tin = 10, poly = 70, sd = 40, ild = 150;
  const xs = [0, ...gates.flatMap((c) => [c - Lg / 2, c + Lg / 2]), W];
  for (let i = 0; i < xs.length - 1; i += 2) rect(xs[i], surf, xs[i + 1], surf + sd, C['Si n+']);
  rect(0, surf - ild, W, surf, C.ILD);
  gates.forEach((c) => {
    const a = c - Lg / 2, b = c + Lg / 2, top = surf - tox - hk - tin - poly;
    rect(a - sp, surf - tox, b + sp, surf, C['SiO₂']);
    rect(a - sp, top, a, surf - tox, C.SiN);
    rect(b, top, b + sp, surf - tox, C.SiN);
    rect(a, surf - tox - hk, b, surf - tox, C['HfO₂']);
    rect(a, surf - tox - hk - tin, b, surf - tox - hk, C.TiN);
    rect(a, top, b, surf - tox - hk - tin, C['Poly-Si']);
  });
  [
    [0, gates[0] - Lg / 2 - sp],
    [gates[0] + Lg / 2 + sp, gates[1] - Lg / 2 - sp],
    [gates[1] + Lg / 2 + sp, gates[2] - Lg / 2 - sp],
    [gates[2] + Lg / 2 + sp, W],
  ].forEach(([a, b]) => {
    const m = Math.round((a + b) / 2);
    rect(m - 12, surf - ild, m + 12, surf, C.W);
  });
  for (let i = 0; i < 20; i++)
    for (let j = 0; j < 20; j++) {
      const x = gates[1] + Lg / 2 + sp - 20 + j;
      const y = surf - tox - hk - tin - poly + i;
      const p = (y * W + x) * 4;
      if (j > i) {
        const [r, g, b] = fromHex(C.ILD);
        d[p] = r; d[p + 1] = g; d[p + 2] = b;
      } else if (j === i) {
        const [r1, g1, b1] = fromHex(C.ILD);
        const [r2, g2, b2] = fromHex(C.SiN);
        d[p] = (r1 + r2) >> 1; d[p + 1] = (g1 + g2) >> 1; d[p + 2] = (b1 + b2) >> 1;
      }
    }
  return { width: W, height: H, data: d };
}

/** Y-Cut：跨 fin，3 根圓頂 fin，外包 HfO₂ / TiN，上方 poly gate 與 SiN hard mask */
export function demoY(): RasterImage {
  const d = new Uint8ClampedArray(W * H * 4);
  const put = (x: number, y: number, hex: string) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const [r, g, b] = fromHex(hex);
    const p = (y * W + x) * 4;
    d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255;
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, hex: string) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, hex);
  };
  rect(0, 0, W, H, C.Air);
  const sti = 250, finTop = 130, finW = 44;
  rect(0, sti, W, H, C['Si (p)']);
  rect(0, sti - 40, W, sti, C['SiO₂']);
  rect(40, 60, 600, sti - 40, C['Poly-Si']);
  rect(40, 40, 600, 60, C.SiN);
  [160, 320, 480].forEach((cx) => {
    const layers: [number, string][] = [[8, C['HfO₂']], [4, C.TiN], [0, C.fin ?? C['Si n+']]];
    for (const [grow, hex] of layers) {
      const half = finW / 2 + grow, top = finTop - grow, rad = half;
      for (let y = top; y < sti; y++)
        for (let x = cx - half; x < cx + half; x++) {
          const yc = top + rad;
          if (y >= yc || (x - cx) ** 2 + (y - yc) ** 2 <= rad * rad) put(Math.round(x), y, hex);
        }
    }
  });
  return { width: W, height: H, data: d };
}

/** Z-Cut：俯視，3 條 fin（Si n+）× 3 條 gate（Poly），交會處 TiN */
export function demoZ(): RasterImage {
  const d = new Uint8ClampedArray(W * H * 4);
  const rect = (x0: number, y0: number, x1: number, y1: number, hex: string) => {
    const [r, g, b] = fromHex(hex);
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const p = (y * W + x) * 4;
        d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255;
      }
  };
  rect(0, 0, W, H, C['SiO₂']);
  [80, 180, 280].forEach((y) => rect(0, y, W, y + 30, C['Si n+']));
  [120, 320, 520].forEach((x) => rect(x - 30, 0, x + 30, H, C['Poly-Si']));
  [120, 320, 520].forEach((x) => [80, 180, 280].forEach((y) => rect(x - 30, y, x + 30, y + 30, C.TiN)));
  return { width: W, height: H, data: d };
}
