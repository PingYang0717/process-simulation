import { bboxOf, edgeKey, polyOf, segDist } from '../model/geometry';
import { setHandles } from '../model/ops';
import type { Imported, Model, Region, XY } from '../model/types';
import { insertNode } from '../raster/nodes';

/**
 * 對應項目：把座標正規化到所屬區域外框的 [0,1]²，
 * 在其他已選區域找最近的頂點（門檻 0.12）或邊（兩端點距離和，門檻 0.2，允許方向相反）。
 */
export function counterparts(model: Model, kind: 'vertex' | 'edge', item: string, owner: string, scope: string[]): string[] {
  if (scope.length < 2) return [];
  const regions = scope.map((id) => model.regions.find((r) => r.id === id)).filter((r): r is Region => !!r);
  const own = regions.find((r) => r.id === owner);
  if (!own) return [];
  const norm = (r: Region, v: string): XY => {
    const b = bboxOf(polyOf(model, r));
    const p = model.vertices[v];
    return [(p.x - b.x0) / Math.max(1e-6, b.x1 - b.x0), (p.y - b.y0) / Math.max(1e-6, b.y1 - b.y0)];
  };
  const dist = (p: XY, q: XY) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const out: string[] = [];
  if (kind === 'vertex') {
    const p = norm(own, item);
    for (const r of regions) {
      if (r === own) continue;
      let best = '', bd = 0.12;
      for (const v of r.loop) {
        const d = dist(p, norm(r, v));
        if (d < bd) { bd = d; best = v; }
      }
      if (best) out.push(best);
    }
  } else {
    const [a, b] = item.split('|');
    const pa = norm(own, a), pb = norm(own, b);
    for (const r of regions) {
      if (r === own) continue;
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

/** 把 from 區域上的點，依外框比例對應到 to 區域上的位置 */
export function mapPoint(model: Model, from: Region, to: Region, p: XY): XY {
  const a = bboxOf(polyOf(model, from)), b = bboxOf(polyOf(model, to));
  const u = (p[0] - a.x0) / Math.max(1e-6, a.x1 - a.x0), v = (p[1] - a.y0) / Math.max(1e-6, a.y1 - a.y0);
  return [b.x0 + u * (b.x1 - b.x0), b.y0 + v * (b.y1 - b.y0)];
}

/**
 * 在區域輪廓上找 p 位置的節點：1 px 內已有輪廓點就把它設成節點，否則在最近的邊上（沿原始像素輪廓）新增一個。
 * 新增節點不改形狀；用在多個相同結構一起編輯時，讓每個結構在同一個位置都有節點。
 */
export function nodeAt(model: Model, imp: Imported, region: Region, p: XY): { model: Model; id: string } {
  let best = '', bd = 1;
  for (const ring of [region.loop, ...(region.holes ?? [])])
    for (const id of ring) {
      const v = model.vertices[id];
      const d = Math.hypot(v.x - p[0], v.y - p[1]);
      if (d <= bd) { bd = d; best = id; }
    }
  if (best) return { model: model.handles.includes(best) ? model : setHandles(model, [best], true), id: best };
  let edge: [string, string] | null = null, ed = Infinity;
  for (const ring of [region.loop, ...(region.holes ?? [])])
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length];
      const A = model.vertices[a], B = model.vertices[b];
      const d = segDist(p, [A.x, A.y], [B.x, B.y]);
      if (d < ed) { ed = d; edge = [a, b]; }
    });
  if (!edge) return { model, id: '' };
  return insertNode(model, imp, edge[0], edge[1], p);
}
