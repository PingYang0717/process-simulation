import type { Edge, Model, Region, XY } from './types';

export interface BBox { x0: number; y0: number; x1: number; y1: number }

export const r1 = (v: number) => Math.round(v * 10) / 10;
export const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function polyOf(model: Model, region: Region): XY[] {
  return region.loop.map((id) => {
    const v = model.vertices[id];
    return [v.x, v.y];
  });
}

/** 從所有環推導邊表，記錄每條邊被哪些區域共用 */
export function edgesOf(model: Model): Edge[] {
  const map = new Map<string, Edge>();
  for (const r of model.regions) {
    const n = r.loop.length;
    for (let i = 0; i < n; i++) {
      const a = r.loop[i];
      const b = r.loop[(i + 1) % n];
      const key = edgeKey(a, b);
      const e = map.get(key);
      if (e) {
        if (!e.regions.includes(r.id)) e.regions.push(r.id);
      } else map.set(key, { key, a: a < b ? a : b, b: a < b ? b : a, regions: [r.id] });
    }
  }
  return [...map.values()];
}

export function bboxOf(pts: XY[]): BBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

export function centroid(pts: XY[]): XY {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const b = bboxOf(pts);
    return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function pointInPoly([px, py]: XY, pts: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export interface EdgeFrame { dir: XY; normal: XY; length: number }

/** 邊的單位方向、法向（指向遠離 awayFrom 區域那側）、長度 */
export function edgeFrame(model: Model, edge: Edge, awayFrom?: string): EdgeFrame {
  const a = model.vertices[edge.a];
  const b = model.vertices[edge.b];
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const dir: XY = [(b.x - a.x) / length, (b.y - a.y) / length];
  let normal: XY = [-dir[1], dir[0]];
  const region = model.regions.find((r) => r.id === (awayFrom ?? edge.regions[0]));
  if (region) {
    const [cx, cy] = centroid(polyOf(model, region));
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if ((mx - cx) * normal[0] + (my - cy) * normal[1] < 0) normal = [-normal[0], -normal[1]];
  }
  return { dir, normal, length };
}

export function edgeLength(model: Model, a: string, b: string): number {
  const va = model.vertices[a];
  const vb = model.vertices[b];
  if (!va || !vb) return NaN;
  return Math.hypot(vb.x - va.x, vb.y - va.y);
}

/** 點到線段的投影參數 t ∈ [0,1] 與距離 */
export function projectOnSegment([px, py]: XY, [ax, ay]: XY, [bx, by]: XY): { t: number; dist: number } {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const qx = ax + t * dx, qy = ay + t * dy;
  return { t, dist: Math.hypot(px - qx, py - qy) };
}

export function segInRect(a: XY, b: XY, r: BBox): boolean {
  const inside = (p: XY) => p[0] >= r.x0 && p[0] <= r.x1 && p[1] >= r.y0 && p[1] <= r.y1;
  return inside(a) && inside(b);
}
