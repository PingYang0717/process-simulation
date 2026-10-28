import type { Edge, Model, Region, Vertex, XY } from './types';

export interface BBox { x0: number; y0: number; x1: number; y1: number }

export const r1 = (v: number) => Math.round(v * 10) / 10;
export const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** 從所有環推導邊表，記錄每條邊被哪些區域共用 */
export function edgesOf(model: Model): Edge[] {
  const map = new Map<string, Edge>();
  for (const r of model.regions) {
    const n = r.loop.length;
    for (let i = 0; i < n; i++) {
      const key = edgeKey(r.loop[i], r.loop[(i + 1) % n]);
      const [a, b] = key.split('|');
      const e = map.get(key) ?? { key, a, b, regions: [] };
      e.regions.push(r.id);
      map.set(key, e);
    }
  }
  return [...map.values()];
}

export const polyOf = (model: Model, region: Region): XY[] =>
  region.loop.map((id) => [model.vertices[id].x, model.vertices[id].y]);

export function pointInPoly([px, py]: XY, pts: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function bboxOf(pts: XY[]): BBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1 };
}

export interface EdgeFrame { A: Vertex; B: Vertex; L: number; u: XY; n: XY }

/** 邊的端點、長度、單位方向 u、法向 n（指向遠離 awayFrom 區域那側） */
export function edgeFrame(model: Model, edge: Edge, awayFrom?: string): EdgeFrame {
  const A = model.vertices[edge.a];
  const B = model.vertices[edge.b];
  const L = Math.hypot(B.x - A.x, B.y - A.y) || 1;
  const u: XY = [(B.x - A.x) / L, (B.y - A.y) / L];
  let n: XY = [-u[1], u[0]];
  const region = model.regions.find((r) => r.id === (awayFrom ?? edge.regions[0]));
  if (region) {
    const probe: XY = [(A.x + B.x) / 2 + n[0] * 0.5, (A.y + B.y) / 2 + n[1] * 0.5];
    if (pointInPoly(probe, polyOf(model, region))) n = [-n[0], -n[1]];
  }
  return { A, B, L, u, n };
}

export function edgeLength(model: Model, a: string, b: string): number | undefined {
  const va = model.vertices[a], vb = model.vertices[b];
  return va && vb ? Math.hypot(vb.x - va.x, vb.y - va.y) : undefined;
}
