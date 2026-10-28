import { edgeKey, ringsOf, segDist } from './geometry';
import type { Model, Region, XY } from './types';

/**
 * 「角」：從 i 沿環往前、往後各走約 walk px 取方向，夾角 ≥ minDeg 才算。
 * 像素階梯的 1 px 小折走一段就被抹平，所以圓弧上不會冒出一堆把手。
 */
export function isCorner(model: Model, ring: string[], i: number, minDeg = 50, walk = 6): boolean {
  const n = ring.length;
  if (n < 3) return true;
  const p = model.vertices[ring[i]];
  const reach = (step: number): XY => {
    let len = 0, k = i, x = p.x, y = p.y;
    for (let s = 0; s < n - 1 && len < walk; s++) {
      k = (k + step + n) % n;
      const q = model.vertices[ring[k]];
      len += Math.hypot(q.x - x, q.y - y);
      x = q.x;
      y = q.y;
    }
    return [x, y];
  };
  const back = reach(-1), fwd = reach(1);
  const a: XY = [p.x - back[0], p.y - back[1]], b: XY = [fwd[0] - p.x, fwd[1] - p.y];
  const la = Math.hypot(a[0], a[1]) || 1, lb = Math.hypot(b[0], b[1]) || 1;
  const cos = Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / (la * lb)));
  return (Math.acos(cos) * 180) / Math.PI >= minDeg;
}

/** 平滑邊：從 a–b 沿環往兩側走到「角」為止，回傳整段的 edgeKey */
export function smoothEdgeGroup(model: Model, region: Region, a: string, b: string, minDeg = 50): string[] {
  const ring = ringsOf(region).find((r) =>
    r.some((v, i) => {
      const w = r[(i + 1) % r.length];
      return (v === a && w === b) || (v === b && w === a);
    }),
  );
  if (!ring) return [edgeKey(a, b)];
  const n = ring.length;
  const start = ring.findIndex((v, i) => (v === a && ring[(i + 1) % n] === b) || (v === b && ring[(i + 1) % n] === a));
  const group = [edgeKey(ring[start], ring[(start + 1) % n])];
  let k = start;
  for (let s = 0; s < n - 1; s++) {
    const next = (k + 1) % n;
    if (next === start || isCorner(model, ring, next, minDeg)) break;
    group.push(edgeKey(ring[next], ring[(next + 1) % n]));
    k = next;
  }
  k = start;
  for (let s = 0; s < n - 1; s++) {
    if (group.length >= n || isCorner(model, ring, k, minDeg)) break;
    const prev = (k - 1 + n) % n;
    const key = edgeKey(ring[prev], ring[(prev + 1) % n]);
    if (group.includes(key)) break;
    group.push(key);
    k = prev;
  }
  return group;
}

/** 點到一組移動中邊的最近距離，以及該處沿邊內插的位移 */
function nearestMoved(model: Model, edges: [string, string][], disp: Map<string, XY>, p: XY): { d: number; v: XY } {
  let best = { d: Infinity, v: [0, 0] as XY };
  for (const [a, b] of edges) {
    const A = model.vertices[a], B = model.vertices[b];
    const da = disp.get(a) ?? [0, 0], db = disp.get(b) ?? [0, 0];
    const l2 = (B.x - A.x) ** 2 + (B.y - A.y) ** 2 || 1e-9;
    const t = Math.max(0, Math.min(1, ((p[0] - A.x) * (B.x - A.x) + (p[1] - A.y) * (B.y - A.y)) / l2));
    const d = Math.hypot(A.x + t * (B.x - A.x) - p[0], A.y + t * (B.y - A.y) - p[1]);
    if (d < best.d) best = { d, v: [da[0] + t * (db[0] - da[0]), da[1] + t * (db[1] - da[1])] };
  }
  return best;
}

/**
 * 連帶推動：以被拖頂點為種子，找共用這些頂點的區域；其餘頂點到移動邊的距離若 ≤ maxThick
 * 且最大最小差 ≤ tol，視為均勻薄層，每個頂點取最近已移動頂點的位移（超過一層厚度則不動）。
 * 新移動的頂點成為下一層的種子，最多 maxLayers 層。落在被拖邊上（距離 < 0.5）的頂點不列入厚度統計。
 */
export function propagateLayers(model: Model, seed: Map<string, XY>, maxLayers = 3, maxThick = 16, tol = 2.5): { disp: Map<string, XY>; layers: string[] } {
  const disp = new Map(seed);
  let front = new Set(seed.keys());
  const layers: string[] = [];
  for (let layer = 0; layer < maxLayers && front.size; layer++) {
    const edges: [string, string][] = [];
    for (const r of model.regions)
      for (const ring of ringsOf(r))
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i], b = ring[(i + 1) % ring.length];
          if (front.has(a) || front.has(b)) edges.push([a, b]);
        }
    const next = new Set<string>();
    for (const r of model.regions) {
      const all = ringsOf(r).flat();
      if (!all.some((v) => front.has(v))) continue;
      const rest = all.filter((v) => !disp.has(v));
      if (!rest.length) continue;
      const ds = rest.map((v) => nearestMoved(model, edges, disp, [model.vertices[v].x, model.vertices[v].y]).d).filter((d) => d >= 0.5);
      if (!ds.length) continue;
      const hi = Math.max(...ds), lo = Math.min(...ds);
      if (hi > maxThick || hi - lo > tol) continue;
      rest.forEach((v) => {
        const p = model.vertices[v];
        let bd = Infinity, bv: XY = [0, 0];
        front.forEach((s) => {
          const q = model.vertices[s];
          const d = Math.hypot(q.x - p.x, q.y - p.y);
          if (d < bd) { bd = d; bv = disp.get(s) ?? [0, 0]; }
        });
        if (bd <= maxThick + tol && (bv[0] || bv[1])) {
          disp.set(v, bv);
          next.add(v);
        }
      });
      if (!layers.includes(r.id)) layers.push(r.id);
    }
    front = next;
  }
  return { disp, layers };
}

/**
 * 防穿層：位移後，對每個含移動頂點的區域檢查
 * 「移動的頂點 ↔ 沒動的非相鄰邊」與「沒動的頂點 ↔ 有移動端點的邊」距離 ≥ gap。
 */
export function violates(model: Model, disp: Map<string, XY>, gap = 1): boolean {
  const pos = (id: string): XY => {
    const v = model.vertices[id], d = disp.get(id) ?? [0, 0];
    return [v.x + d[0], v.y + d[1]];
  };
  for (const r of model.regions) {
    if (!ringsOf(r).flat().some((v) => disp.has(v))) continue;
    for (const ring of ringsOf(r)) {
      const n = ring.length;
      for (let i = 0; i < n; i++) {
        const v = ring[i];
        const p = pos(v);
        const moved = disp.has(v);
        for (let j = 0; j < n; j++) {
          const a = ring[j], b = ring[(j + 1) % n];
          if (a === v || b === v) continue;
          const edgeMoved = disp.has(a) || disp.has(b);
          if (moved ? edgeMoved : !edgeMoved) continue;
          if (segDist(p, pos(a), pos(b)) < gap) return true;
        }
      }
    }
  }
  return false;
}
