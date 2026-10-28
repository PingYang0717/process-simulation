import { bboxOf } from '../model/geometry';
import type { Imported, Material, Model, Region, XY } from '../model/types';
import { fromHex } from './color';
import type { RGB } from './color';

export const materialOf = (materials: Material[], id: string) => materials.find((m) => m.id === id) ?? materials[0];

/** 區域有沒有變：材質不同、頂點數不同、或任一頂點座標與載入時不同 */
export function regionChanged(model: Model, original: Model, region: Region): boolean {
  const orig = original.regions.find((r) => r.id === region.id);
  if (!orig) return true;
  const sameRing = (cur: string[], old: string[]) =>
    cur.length === old.length &&
    cur.every((id, i) => {
      const a = model.vertices[id], b = original.vertices[old[i]];
      return a && b && a.x === b.x && a.y === b.y;
    });
  if (orig.material !== region.material || !sameRing(region.loop, orig.loop)) return true;
  const h1 = region.holes ?? [], h0 = orig.holes ?? [];
  return h1.length !== h0.length || !h1.every((h, i) => sameRing(h, h0[i]));
}

/** 像素中心掃描線填色（even-odd，多環），不反鋸齒 */
function fillRings(data: Uint8ClampedArray, W: number, H: number, rings: XY[][], [r, g, b]: RGB) {
  const bb = bboxOf(rings[0]);
  const y0 = Math.max(0, Math.floor(bb.y0));
  const y1 = Math.min(H - 1, Math.ceil(bb.y1));
  const xs: number[] = [];
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5;
    xs.length = 0;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi <= cy !== yj <= cy) xs.push(xi + ((cy - yi) * (xj - xi)) / (yj - yi));
      }
    }
    xs.sort((a, c) => a - c);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - 0.5));
      const to = Math.min(W, Math.ceil(xs[k + 1] - 0.5));
      for (let x = from; x < to; x++) {
        const p = (y * W + x) * 4;
        data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
      }
    }
  }
}

export interface ExportResult { data: Uint8ClampedArray; changed: string[]; diffPx: number }

/**
 * 輸出：從原圖出發，只重畫變動的區域。
 * 變動區域的原像素（靠 labels 精確找出）先填回填材質，再依 regions 順序用新多邊形掃描線填色。
 */
export function exportRaster(imp: Imported, model: Model, materials: Material[], backfill: string): ExportResult {
  const { width: W, height: H, original, labels, nmPerPx } = imp;
  const out = new Uint8ClampedArray(original);
  const changed = model.regions.filter((r) => regionChanged(model, imp.model, r));
  const [br, bg, bb] = fromHex(materialOf(materials, backfill).fill);
  const clear = new Set(changed.map((r) => parseInt(r.id.slice(1), 10)).filter((v) => Number.isFinite(v)));
  if (clear.size) {
    for (let i = 0; i < W * H; i++) {
      if (!clear.has(labels[i])) continue;
      const p = i * 4;
      out[p] = br; out[p + 1] = bg; out[p + 2] = bb; out[p + 3] = 255;
    }
  }
  for (const r of model.regions) {
    if (!changed.includes(r)) continue;
    const px = (ring: string[]): XY[] => ring.map((id) => [model.vertices[id].x / nmPerPx, model.vertices[id].y / nmPerPx]);
    fillRings(out, W, H, [px(r.loop), ...(r.holes ?? []).map(px)], fromHex(materialOf(materials, r.material).fill));
  }
  let diffPx = 0;
  for (let p = 0; p < W * H * 4; p += 4) {
    if (out[p] !== original[p] || out[p + 1] !== original[p + 1] || out[p + 2] !== original[p + 2]) diffPx++;
  }
  return { data: out, changed: changed.map((r) => r.id), diffPx };
}
