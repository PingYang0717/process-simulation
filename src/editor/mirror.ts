import { bboxOf, edgeKey, polyOf } from '../model/geometry';
import type { Mode, Model, Region, XY } from '../model/types';

const VERTEX_TOL = 0.12;
const EDGE_TOL = 0.2;

function normalizer(model: Model, r: Region) {
  const b = bboxOf(polyOf(model, r));
  const w = b.x1 - b.x0 || 1, h = b.y1 - b.y0 || 1;
  return (id: string): XY => {
    const v = model.vertices[id];
    return [(v.x - b.x0) / w, (v.y - b.y0) / h];
  };
}

const dist = (p: XY, q: XY) => Math.hypot(p[0] - q[0], p[1] - q[1]);

function loopEdges(r: Region): [string, string][] {
  return r.loop.map((a, i) => [a, r.loop[(i + 1) % r.loop.length]]);
}

/**
 * 對應項目：把座標正規化到所屬區域外框的 [0,1]²，
 * 在其他範圍內區域找最近的頂點（門檻 0.12）或邊（兩端點距離和，門檻 0.2，允許方向相反）。
 */
export function counterparts(model: Model, scope: string[], item: string, mode: Mode): string[] {
  const regions = scope.map((id) => model.regions.find((r) => r.id === id)).filter((r): r is Region => !!r);
  if (regions.length < 2 || mode === 'region') return [];
  const out: string[] = [];
  if (mode === 'vertex') {
    const owner = regions.find((r) => r.loop.includes(item));
    if (!owner) return [];
    const p = normalizer(model, owner)(item);
    for (const r of regions) {
      if (r === owner) continue;
      const norm = normalizer(model, r);
      let best: string | undefined, bd = VERTEX_TOL;
      for (const id of r.loop) {
        const d = dist(norm(id), p);
        if (d < bd) { bd = d; best = id; }
      }
      if (best && best !== item) out.push(best);
    }
  } else {
    const [a, b] = item.split('|');
    const owner = regions.find((r) => loopEdges(r).some(([p, q]) => edgeKey(p, q) === item));
    if (!owner) return [];
    const n0 = normalizer(model, owner);
    const pa = n0(a), pb = n0(b);
    for (const r of regions) {
      if (r === owner) continue;
      const norm = normalizer(model, r);
      let best: string | undefined, bd = EDGE_TOL;
      for (const [p, q] of loopEdges(r)) {
        const qp = norm(p), qq = norm(q);
        const d = Math.min(dist(pa, qp) + dist(pb, qq), dist(pa, qq) + dist(pb, qp));
        if (d < bd) { bd = d; best = edgeKey(p, q); }
      }
      if (best && best !== item) out.push(best);
    }
  }
  return out;
}
