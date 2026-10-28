import { bboxOf, edgeKey } from '../model/geometry';
import type { Imported, Material, Model, Region, XY } from '../model/types';
import { fromHex } from './color';
import type { RGB } from './color';

export const materialOf = (materials: Material[], id: string) => materials.find((m) => m.id === id) ?? materials[0];

/** 區域有沒有變：材質不同、頂點數不同、或任一頂點座標（含孔洞）與載入時不同 */
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

/** 頂點相對載入時的整數位移；分離出來的頂點對 src 比；非整數或找不到回傳 null */
function shiftOf(model: Model, imp: Imported, id: string): XY | null {
  const v = model.vertices[id], o = imp.model.vertices[v.src ?? id];
  if (!o) return null;
  const dx = v.x - o.x, dy = v.y - o.y;
  return Number.isInteger(dx) && Number.isInteger(dy) ? [dx, dy] : null;
}

/** 整塊同一個整數位移 → 可以直接複製原像素 */
function uniformShift(model: Model, imp: Imported, region: Region): XY | null {
  let shift: XY | null = null;
  for (const ring of [region.loop, ...(region.holes ?? [])])
    for (const id of ring) {
      const s = shiftOf(model, imp, id);
      if (!s) return null;
      if (!shift) shift = s;
      else if (shift[0] !== s[0] || shift[1] !== s[1]) return null;
    }
  return shift;
}

/**
 * 一段邊 a→b 的實際形狀（不含 b）：沿用原始像素輪廓，每個點的位移由兩端位移沿輪廓長度內插再取整；
 * 兩端位移相同時就是整段平移。找不到原始輪廓（新插的頂點）或位移不是整數時用直線。
 * 相鄰區域共用同一段、同一套算法，所以不會留縫；畫面上的輪廓也用它，看到的就是輸出的。
 */
export function segmentPts(model: Model, imp: Imported, a: string, b: string): XY[] {
  const va = model.vertices[a], vb = model.vertices[b];
  const seg = imp.exact.get(edgeKey(va.src ?? a, vb.src ?? b));
  const sa = shiftOf(model, imp, a), sb = shiftOf(model, imp, b);
  if (!seg || !sa || !sb) return [[va.x, va.y]];
  const pts = seg.from === (va.src ?? a) ? seg.pts : [...seg.pts].reverse();
  if (sa[0] === sb[0] && sa[1] === sb[1]) return pts.slice(0, -1).map(([x, y]) => [x + sa[0], y + sa[1]]);
  const along = [0];
  for (let k = 1; k < pts.length; k++) along.push(along[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const L = along[along.length - 1] || 1;
  return pts.slice(0, -1).map(([x, y], k) => {
    const t = along[k] / L;
    return [x + Math.round(sa[0] + t * (sb[0] - sa[0])), y + Math.round(sa[1] + t * (sb[1] - sa[1]))];
  });
}

/** 環 → 輸出用的點列 */
export const exactRing = (model: Model, imp: Imported, ring: string[]): XY[] =>
  ring.flatMap((a, i) => segmentPts(model, imp, a, ring[(i + 1) % ring.length]));

/** 像素中心掃描線填色（even-odd，多環），不反鋸齒；hits 記每像素被填幾次 */
function fillRings(data: Uint8ClampedArray, hits: Uint8Array, W: number, H: number, rings: XY[][], [r, g, b]: RGB) {
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
        const i = y * W + x, p = i * 4;
        data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
        hits[i]++;
      }
    }
  }
}

/** 重畫方式：copy 像素複製、exact 原始輪廓、poly 直線 */
export type DrawMode = 'copy' | 'exact' | 'poly';

export interface MaterialTally { id: string; name: string; before: number; after: number }

export interface ExportResult {
  data: Uint8ClampedArray;
  changed: string[];
  diffPx: number;
  diffMask: Uint8Array;
  overlapPx: number;
  byMaterial: MaterialTally[];
  warnings: string[];
  labelMap: Uint8Array; // 每像素材質索引（255 = 不在調色盤）
  modes: Record<string, DrawMode>;
}

/**
 * 輸出：從原圖出發，只重畫變動的區域。
 * 變動區域的原像素（靠 labels 精確找出）先填回填材質，再依 regions 順序重畫：
 * 整塊整數位移 → 像素複製；否則沿原始像素輪廓（兩端位移不同時沿長度內插），掃描線填色。
 */
export function exportRaster(imp: Imported, model: Model, materials: Material[], backfill: string): ExportResult {
  const { width: W, height: H, original, labels } = imp;
  const out = new Uint8ClampedArray(original);
  const hits = new Uint8Array(W * H);
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

  const modes: Record<string, DrawMode> = {};
  const warnings: string[] = [];
  for (const r of model.regions) {
    if (!changed.includes(r)) continue;
    const rgb = fromHex(materialOf(materials, r.material).fill);
    const shift = uniformShift(model, imp, r);
    const label = parseInt(r.id.slice(1), 10);
    if (shift && Number.isFinite(label)) {
      modes[r.id] = 'copy';
      const [dx, dy] = shift;
      for (let i = 0; i < W * H; i++) {
        if (labels[i] !== label) continue;
        const x = (i % W) + dx, y = (i - (i % W)) / W + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const j = y * W + x, p = j * 4;
        out[p] = rgb[0]; out[p + 1] = rgb[1]; out[p + 2] = rgb[2]; out[p + 3] = 255;
        hits[j]++;
      }
    } else {
      const rings = [exactRing(model, imp, r.loop), ...(r.holes ?? []).map((h) => exactRing(model, imp, h))];
      modes[r.id] = rings.some((ring) => ring.length > r.loop.length) ? 'exact' : 'poly';
      fillRings(out, hits, W, H, rings, rgb);
      const b = bboxOf(rings[0]);
      if (Math.min(b.x1 - b.x0, b.y1 - b.y0) < 2) warnings.push(`${r.label} 厚度不足 2 px`);
    }
  }

  const diffMask = new Uint8Array(W * H);
  const labelMap = new Uint8Array(W * H);
  const byColor = new Map<number, string>();
  materials.forEach((m) => {
    const [r, g, b] = fromHex(m.fill);
    byColor.set((r << 16) | (g << 8) | b, m.id);
  });
  const indexOf = new Map(materials.map((m, i) => [m.id, i]));
  const before = new Map<string, number>(), after = new Map<string, number>();
  let diffPx = 0, overlapPx = 0, foreign = 0;
  for (let i = 0; i < W * H; i++) {
    const p = i * 4;
    if (out[p] !== original[p] || out[p + 1] !== original[p + 1] || out[p + 2] !== original[p + 2]) {
      diffMask[i] = 1;
      diffPx++;
    }
    if (hits[i] > 1) overlapPx++;
    const m0 = imp.labelMaterial[labels[i]];
    before.set(m0, (before.get(m0) ?? 0) + 1);
    const m1 = byColor.get((out[p] << 16) | (out[p + 1] << 8) | out[p + 2]);
    if (m1 === undefined) {
      foreign++;
      labelMap[i] = 255;
    } else {
      after.set(m1, (after.get(m1) ?? 0) + 1);
      labelMap[i] = indexOf.get(m1)!;
    }
  }
  if (foreign) warnings.push(`${foreign} 個像素的顏色不在調色盤內`);
  if (overlapPx) warnings.push(`${overlapPx} 個像素被兩個區域重疊覆蓋（依順序取後者）`);
  const byMaterial = materials
    .map((m) => ({ id: m.id, name: m.name, before: before.get(m.id) ?? 0, after: after.get(m.id) ?? 0 }))
    .filter((t) => t.before || t.after);
  return { data: out, changed: changed.map((r) => r.id), diffPx, diffMask, overlapPx, byMaterial, warnings, labelMap, modes };
}
