import type { Model, Region, RegionSpec, Vertex, World } from './types';

const keyOf = (x: number, y: number) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)}`;

/**
 * 由多邊形點列建模：相同座標合併為共用頂點，共線處自動插入頂點（heal）。
 * 頂點 id 依首次出現順序編號，同一組 specs 形狀（只改尺寸）會得到同一組 id，
 * 參數連動靠這點比對新舊產生結果。
 */
export function buildModel(specs: RegionSpec[], world: World): Model {
  const vertices: Record<string, Vertex> = {};
  const byKey = new Map<string, string>();
  let n = 0;
  const regions: Region[] = specs.map((s) => {
    const loop: string[] = [];
    for (const [x, y] of s.pts) {
      const k = keyOf(x, y);
      let id = byKey.get(k);
      if (!id) {
        id = `v${n++}`;
        byKey.set(k, id);
        vertices[id] = { id, x, y };
      }
      if (loop[loop.length - 1] !== id) loop.push(id);
    }
    if (loop.length > 1 && loop[0] === loop[loop.length - 1]) loop.pop();
    return { id: s.id, label: s.label, material: s.material, kind: s.kind, loop };
  });

  const all = Object.values(vertices);
  for (const r of regions) {
    const healed: string[] = [];
    for (let i = 0; i < r.loop.length; i++) {
      const a = vertices[r.loop[i]];
      const b = vertices[r.loop[(i + 1) % r.loop.length]];
      healed.push(a.id);
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1e-12) continue;
      const len = Math.sqrt(len2);
      const onEdge: { id: string; t: number }[] = [];
      for (const v of all) {
        if (r.loop.includes(v.id)) continue;
        const t = ((v.x - a.x) * dx + (v.y - a.y) * dy) / len2;
        if (t <= 1e-6 || t >= 1 - 1e-6) continue;
        const cross = Math.abs((v.x - a.x) * dy - (v.y - a.y) * dx) / len;
        if (cross < 1e-4) onEdge.push({ id: v.id, t });
      }
      onEdge.sort((p, q) => p.t - q.t).forEach((p) => healed.push(p.id));
    }
    r.loop = healed;
  }
  return { vertices, regions, world };
}

export const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
