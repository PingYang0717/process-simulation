import { bboxOf, edgeKey, polyOf } from '../model/geometry';
import type { Mode, Model, Region, XY } from '../model/types';

/**
 * 對應項目：把座標正規化到所屬區域外框的 [0,1]²，
 * 在其他範圍內區域找最近的頂點（門檻 0.12）或邊（兩端點距離和，門檻 0.2，允許方向相反）。
 */
export function counterparts(model: Model, mode: Mode, item: string, scope: string[]): string[] {
  if (mode === 'region' || scope.length < 2) return [];
  const regions = scope.map((id) => model.regions.find((r) => r.id === id)).filter((r): r is Region => !!r);
  const norm = (r: Region, v: string): XY => {
    const b = bboxOf(polyOf(model, r));
    const p = model.vertices[v];
    return [(p.x - b.x0) / Math.max(1e-6, b.x1 - b.x0), (p.y - b.y0) / Math.max(1e-6, b.y1 - b.y0)];
  };
  const dist = (p: XY, q: XY) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const out: string[] = [];
  if (mode === 'vertex') {
    const owner = regions.find((r) => r.loop.includes(item));
    if (!owner) return [];
    const p = norm(owner, item);
    for (const r of regions) {
      if (r === owner) continue;
      let best = '', bd = 0.12;
      for (const v of r.loop) {
        const d = dist(p, norm(r, v));
        if (d < bd) { bd = d; best = v; }
      }
      if (best) out.push(best);
    }
  } else {
    const [a, b] = item.split('|');
    const owner = regions.find((r) => r.loop.includes(a) && r.loop.includes(b));
    if (!owner) return [];
    const pa = norm(owner, a), pb = norm(owner, b);
    for (const r of regions) {
      if (r === owner) continue;
      let best = '', bd = 0.2;
      for (let i = 0; i < r.loop.length; i++) {
        const p = r.loop[i], q = r.loop[(i + 1) % r.loop.length];
        const np = norm(r, p), nq = norm(r, q);
        const d = Math.min(dist(pa, np) + dist(pb, nq), dist(pa, nq) + dist(pb, np));
        if (d < bd) { bd = d; best = edgeKey(p, q); }
      }
      if (best) out.push(best);
    }
  }
  return out;
}
