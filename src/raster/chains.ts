import { bboxOf, r1 } from '../model/geometry';
import type { Material, Model, Region, Vertex, XY } from '../model/types';

/** 一條邊界鏈：像素格點座標，left/right 為兩側的 label（-1 = 影像外） */
export interface Chain { pts: XY[]; left: number; right: number }

/** Douglas-Peucker，端點固定；首尾相同的封閉鏈先在最遠點切成兩段 */
export function simplify(pts: XY[], tol: number): XY[] {
  if (pts.length <= 2) return pts;
  const [x0, y0] = pts[0];
  const [xn, yn] = pts[pts.length - 1];
  if (x0 === xn && y0 === yn && pts.length > 3) {
    let far = 1, fd = -1;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = (pts[i][0] - x0) ** 2 + (pts[i][1] - y0) ** 2;
      if (d > fd) { fd = d; far = i; }
    }
    const a = simplify(pts.slice(0, far + 1), tol);
    const b = simplify(pts.slice(far), tol);
    return [...a, ...b.slice(1)];
  }
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const [ax, ay] = pts[s];
    const [bx, by] = pts[e];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let idx = -1, md = tol;
    for (let i = s + 1; i < e; i++) {
      const [px, py] = pts[i];
      const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (d > md) { md = d; idx = i; }
    }
    if (idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * 邊界鏈：把像素邊緣當平面圖，角點度數 ≥ 3 為交會點，
 * 交會點之間的邊界是一條鏈；沒有交會點的孤島另起一條封閉鏈。
 * 方向編碼：0 東、1 南、2 西、3 北。
 */
export function traceChains(labels: Int32Array, W: number, H: number): Chain[] {
  const lab = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : labels[y * W + x]);
  const hEdge = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y <= H && lab(x, y - 1) !== lab(x, y);
  const vEdge = (x: number, y: number) => y >= 0 && y < H && x >= 0 && x <= W && lab(x - 1, y) !== lab(x, y);
  const usedH = new Uint8Array((W + 1) * (H + 1));
  const usedV = new Uint8Array((W + 1) * (H + 1));
  const at = (x: number, y: number) => y * (W + 1) + x;
  const degree = (x: number, y: number) =>
    (hEdge(x, y) ? 1 : 0) + (hEdge(x - 1, y) ? 1 : 0) + (vEdge(x, y) ? 1 : 0) + (vEdge(x, y - 1) ? 1 : 0);
  const chains: Chain[] = [];

  const trace = (sx: number, sy: number, dir: number, stopAtJunction: boolean) => {
    const pts: XY[] = [[sx, sy]];
    let x = sx, y = sy, d = dir, left: number, right: number;
    if (dir === 0) { left = lab(sx, sy - 1); right = lab(sx, sy); }
    else if (dir === 2) { left = lab(sx - 1, sy); right = lab(sx - 1, sy - 1); }
    else if (dir === 1) { left = lab(sx, sy); right = lab(sx - 1, sy); }
    else { left = lab(sx - 1, sy - 1); right = lab(sx, sy - 1); }
    for (let guard = 0; guard < 4 * (W + H) * (W + H); guard++) {
      if (d === 0) { usedH[at(x, y)] = 1; x++; }
      else if (d === 2) { usedH[at(x - 1, y)] = 1; x--; }
      else if (d === 1) { usedV[at(x, y)] = 1; y++; }
      else { usedV[at(x, y - 1)] = 1; y--; }
      pts.push([x, y]);
      if ((x === sx && y === sy) || (stopAtJunction && degree(x, y) !== 2)) break;
      const next: number[] = [];
      if (hEdge(x, y) && !usedH[at(x, y)]) next.push(0);
      if (vEdge(x, y) && !usedV[at(x, y)]) next.push(1);
      if (hEdge(x - 1, y) && !usedH[at(x - 1, y)]) next.push(2);
      if (vEdge(x, y - 1) && !usedV[at(x, y - 1)]) next.push(3);
      if (!next.length) break;
      d = next[0];
    }
    chains.push({ pts, left, right });
  };

  for (let y = 0; y <= H; y++) {
    for (let x = 0; x <= W; x++) {
      if (degree(x, y) < 3) continue;
      if (hEdge(x, y) && !usedH[at(x, y)]) trace(x, y, 0, true);
      if (vEdge(x, y) && !usedV[at(x, y)]) trace(x, y, 1, true);
      if (hEdge(x - 1, y) && !usedH[at(x - 1, y)]) trace(x, y, 2, true);
      if (vEdge(x, y - 1) && !usedV[at(x, y - 1)]) trace(x, y, 3, true);
    }
  }
  for (let y = 0; y <= H; y++) {
    for (let x = 0; x < W; x++) if (hEdge(x, y) && !usedH[at(x, y)]) trace(x, y, 0, false);
  }
  return chains;
}

/**
 * 鏈 → Model：每條鏈簡化一次，端點以座標共用，所以相鄰區域自然得到共用頂點、不留縫。
 * 每個 label 收集「左側是我」的鏈（正向）與「右側是我」的鏈（反向）串成環；
 * 外框最大的環為外輪廓，其餘為孔洞。區域依外框面積由大到小排序。
 */
export function chainsToModel(
  chains: Chain[], count: number, colorOf: number[], materials: Material[],
  nmPerPx: number, W: number, H: number, tol = 0.6,
): Model {
  const vertices: Record<string, Vertex> = {};
  const shared = new Map<string, string>();
  let n = 0;
  const vid = ([x, y]: XY, isEnd: boolean) => {
    const key = `${x},${y}`;
    if (isEnd) {
      const hit = shared.get(key);
      if (hit) return hit;
    }
    const id = `v${n++}`;
    vertices[id] = { id, x: r1(x * nmPerPx), y: r1(y * nmPerPx) };
    if (isEnd) shared.set(key, id);
    return id;
  };
  const simple = chains.map((c) => ({ ...c, pts: simplify(c.pts, tol) }));
  const ids = simple.map((c) => c.pts.map((p, i) => vid(p, i === 0 || i === c.pts.length - 1)));
  const area = (loop: string[]) => {
    const b = bboxOf(loop.map((v) => [vertices[v].x, vertices[v].y]));
    return (b.x1 - b.x0) * (b.y1 - b.y0);
  };

  const regions: Region[] = [];
  for (let label = 0; label < count; label++) {
    const mine: string[][] = [];
    simple.forEach((c, i) => {
      if (c.left === label) mine.push(ids[i]);
      else if (c.right === label) mine.push([...ids[i]].reverse());
    });
    const byStart = new Map<string, string[][]>();
    mine.forEach((seg) => {
      if (!byStart.has(seg[0])) byStart.set(seg[0], []);
      byStart.get(seg[0])!.push(seg);
    });
    const used = new Set<string[]>();
    const rings: string[][] = [];
    for (const first of mine) {
      if (used.has(first)) continue;
      const ring: string[] = [];
      let seg = first;
      for (let k = 0; k < mine.length + 1; k++) {
        used.add(seg);
        ring.push(...seg.slice(0, -1));
        const end = seg[seg.length - 1];
        if (end === first[0]) break;
        const next = (byStart.get(end) ?? []).find((s) => !used.has(s));
        if (!next) break;
        seg = next;
      }
      if (ring.length >= 3) rings.push(ring);
    }
    if (!rings.length) continue;
    rings.sort((a, b) => area(b) - area(a));
    const m = materials[colorOf[label]];
    regions.push({
      id: `r${label}`,
      label: `${m.name} ${label + 1}`,
      material: m.id,
      loop: rings[0],
      holes: rings.length > 1 ? rings.slice(1) : undefined,
    });
  }

  const referenced = new Set<string>();
  regions.forEach((r) => {
    r.loop.forEach((v) => referenced.add(v));
    r.holes?.forEach((h) => h.forEach((v) => referenced.add(v)));
  });
  for (const id of Object.keys(vertices)) if (!referenced.has(id)) delete vertices[id];
  regions.sort((a, b) => area(b.loop) - area(a.loop));
  return { vertices, regions, world: { x0: 0, x1: W * nmPerPx, yTop: 0, yBot: H * nmPerPx } };
}
