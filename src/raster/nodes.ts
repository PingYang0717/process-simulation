import { edgeKey, ringsOf } from '../model/geometry';
import { insertBetween, newId } from '../model/ops';
import type { Imported, Model, XY } from '../model/types';
import { segmentPts } from './exportRaster';

/**
 * 在邊 a–b 上靠近 at 處新增節點：落在原始像素輪廓的格點上，並把這段原始輪廓切成兩段登記，
 * 所以新增節點本身不改變輸出（相異仍為 0）。找不到原始輪廓時落在直線上。
 * 注意：會把新的兩段寫進 imp.exact（只增不改，Undo 後留著也無妨）。
 */
export function insertNode(model: Model, imp: Imported, a: string, b: string, at: XY): { model: Model; id: string } {
  const va = model.vertices[a], vb = model.vertices[b];
  const sa = va.src ?? a, sb = vb.src ?? b;
  const seg = imp.exact.get(edgeKey(sa, sb));
  const id = newId('n');
  let vertex;
  if (seg && seg.pts.length > 2) {
    const orig = seg.from === sa ? seg.pts : [...seg.pts].reverse();
    const cur = segmentPts(model, imp, a, b); // 與 orig 一一對應（不含最後一點）
    let k = 1, bd = Infinity;
    for (let i = 1; i < cur.length; i++) {
      const d = Math.hypot(cur[i][0] - at[0], cur[i][1] - at[1]);
      if (d < bd) { bd = d; k = i; }
    }
    vertex = { id, x: Math.round(cur[k][0]), y: Math.round(cur[k][1]), ox: orig[k][0], oy: orig[k][1] };
    imp.exact.set(edgeKey(sa, id), { from: sa, pts: orig.slice(0, k + 1) });
    imp.exact.set(edgeKey(id, sb), { from: id, pts: orig.slice(k) });
  } else {
    const L2 = (vb.x - va.x) ** 2 + (vb.y - va.y) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((at[0] - va.x) * (vb.x - va.x) + (at[1] - va.y) * (vb.y - va.y)) / L2));
    const x = Math.round(va.x + t * (vb.x - va.x)), y = Math.round(va.y + t * (vb.y - va.y));
    vertex = { id, x, y, ox: x, oy: y };
  }
  return {
    id,
    model: {
      ...model,
      vertices: { ...model.vertices, [id]: vertex },
      handles: [...model.handles, id],
      regions: model.regions.map((r) => {
        const rings = ringsOf(r).map((ring) => insertBetween(ring, a, b, [id]));
        return rings.every((ring, i) => ring === ringsOf(r)[i]) ? r : { ...r, loop: rings[0], holes: r.holes ? rings.slice(1) : undefined };
      }),
    },
  };
}
