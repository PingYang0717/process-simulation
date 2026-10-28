import { edgeKey, pointInPoly, ringsOf, segDist } from './geometry';
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
export function propagateLayers(
  model: Model, seed: Map<string, XY>, maxLayers = 3, maxThick = 16, tol = 2.5,
  /** true：取移動邊上最近點的內插位移（往外推用，等同保形偏移）；false：取最近已移動頂點的位移（拖拉用） */
  interp = false,
): { disp: Map<string, XY>; layers: string[] } {
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
        if (interp) {
          // 只看兩端都已移動的邊：一端沒動的邊（例如底部接面）在端點處位移為 0，會把頂點釘住
          const hit = nearestMoved(model, edges.filter(([a, b]) => disp.has(a) && disp.has(b)), disp, [p.x, p.y]);
          const bv: XY = [Math.round(hit.v[0]), Math.round(hit.v[1])];
          if (hit.d <= maxThick + tol && (bv[0] || bv[1])) {
            disp.set(v, bv);
            next.add(v);
          }
          return;
        }
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

const inRegion = (model: Model, r: Region, p: XY) =>
  ringsOf(r).reduce((inside, ring) => (pointInPoly(p, ring.map((v): XY => [model.vertices[v].x, model.vertices[v].y])) ? !inside : inside), false);

/**
 * 往外推：已選邊（edgeKey）上每個頂點沿「平滑後的法線」遠離 owner 區域移 d px，取整數。
 * 法線取自沿已選邊往前後各走約 walk px 的弦，所以像素階梯不會讓方向亂跳；
 * 端點只看已選那一側，矩形或 fin 底部的角會水平移、不會斜著鑽進基板。
 */
export function outwardShifts(model: Model, owner: Region, keys: Set<string>, d: number, walk = 6): Map<string, XY> {
  const out = new Map<string, XY>();
  for (const ring of ringsOf(owner)) {
    const n = ring.length;
    const sel = (i: number) => keys.has(edgeKey(ring[i], ring[(i + 1) % n])); // 邊 i → i+1
    for (let i = 0; i < n; i++) {
      if (!sel(i) && !sel((i - 1 + n) % n)) continue;
      const p = model.vertices[ring[i]];
      const reach = (step: 1 | -1): XY => {
        let len = 0, k = i, x = p.x, y = p.y;
        for (let s = 0; s < n - 1 && len < walk; s++) {
          if (!sel(step === 1 ? k : (k - 1 + n) % n)) break;
          k = (k + step + n) % n;
          const q = model.vertices[ring[k]];
          len += Math.hypot(q.x - x, q.y - y);
          x = q.x;
          y = q.y;
        }
        return [x, y];
      };
      const a = reach(-1), b = reach(1);
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!L) continue;
      let nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
      if (inRegion(model, owner, [p.x + nx * 0.75, p.y + ny * 0.75])) { nx = -nx; ny = -ny; }
      out.set(ring[i], [Math.round(nx * d), Math.round(ny * d)]);
    }
  }
  return out;
}

/**
 * 柔性拖點：從被拖的節點沿輪廓往兩側走到下一個節點（錨點，不動）為止，
 * 中間的頂點依弧長比例 t 以 0.5·(1 + cos(π·t)) 跟著動。拖一個節點，就是改它與左右節點之間的那段輪廓；
 * 只拖單一點時鄰點不動，像素階梯會被拉成鋸齒。
 */
export function falloffWeights(model: Model, seeds: string[], isAnchor: (id: string) => boolean): Map<string, number> {
  const w = new Map<string, number>();
  const put = (id: string, v: number) => { if (v > (w.get(id) ?? 0)) w.set(id, v); };
  const seedSet = new Set(seeds);
  for (const seed of seeds) {
    put(seed, 1);
    for (const r of model.regions)
      for (const ring of ringsOf(r)) {
        const i0 = ring.indexOf(seed);
        if (i0 < 0) continue;
        const n = ring.length;
        for (const step of [1, -1]) {
          const path: { id: string; s: number }[] = [];
          let s = 0, k = i0, total = 0;
          for (let c = 0; c < n - 1; c++) {
            const prev = model.vertices[ring[k]];
            k = (k + step + n) % n;
            const q = model.vertices[ring[k]];
            s += Math.hypot(q.x - prev.x, q.y - prev.y);
            if (isAnchor(ring[k]) || seedSet.has(ring[k])) { total = s; break; }
            path.push({ id: ring[k], s });
          }
          if (!total) continue; // 整圈沒有其他節點：不帶動
          path.forEach(({ id, s: d }) => put(id, 0.5 * (1 + Math.cos((Math.PI * d) / total))));
        }
      }
  }
  return w;
}
