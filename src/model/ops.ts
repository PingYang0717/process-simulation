import { edgeFrame, r1 } from './geometry';
import type { Edge, Model, XY } from './types';

let uid = 0;
const newId = (prefix: string) => `${prefix}${++uid}`;

/** 位移頂點（進位到 0.1 px），回傳新 model */
export function moveVertices(model: Model, delta: Map<string, XY>): Model {
  const vertices = { ...model.vertices };
  for (const [id, [dx, dy]] of delta) {
    const v = vertices[id];
    vertices[id] = { ...v, x: r1(v.x + dx), y: r1(v.y + dy) };
  }
  return { ...model, vertices };
}

/** 所有頂點夾在影像範圍內，並取整數 px */
export function clampToWorld(model: Model): Model {
  const w = model.world;
  let changed = false;
  const vertices = { ...model.vertices };
  for (const id of Object.keys(vertices)) {
    const v = vertices[id];
    const x = Math.round(Math.min(w.x1, Math.max(w.x0, v.x)));
    const y = Math.round(Math.min(w.yBot, Math.max(w.yTop, v.y)));
    if (x !== v.x || y !== v.y) {
      vertices[id] = { ...v, x, y };
      changed = true;
    }
  }
  return changed ? { ...model, vertices } : model;
}

/**
 * 整塊搬動前：區域與鄰居共用的頂點複製一份給自己（src 記原頂點），鄰居保留原頂點；
 * 被搬的區域排到 regions 最後（最上層，輸出時蓋在上面）。
 */
export function detachRegions(model: Model, ids: string[]): Model {
  const moving = new Set(ids);
  const vertices = { ...model.vertices };
  const usedByOthers = new Set<string>();
  for (const r of model.regions) {
    if (moving.has(r.id)) continue;
    r.loop.forEach((v) => usedByOthers.add(v));
    r.holes?.forEach((h) => h.forEach((v) => usedByOthers.add(v)));
  }
  const copy = (v: string) => {
    if (!usedByOthers.has(v)) return v;
    const id = newId('d');
    vertices[id] = { ...vertices[v], id, src: vertices[v].src ?? v };
    return id;
  };
  const regions = model.regions.map((r) =>
    moving.has(r.id) ? { ...r, loop: r.loop.map(copy), holes: r.holes?.map((h) => h.map(copy)) } : r,
  );
  return {
    ...model,
    vertices,
    regions: [...regions.filter((r) => !moving.has(r.id)), ...regions.filter((r) => moving.has(r.id))],
  };
}

/** 在環中 a→b（或 b→a）相鄰處插入 ids（ids 依 a→b 順序） */
function insertBetween(loop: string[], a: string, b: string, ids: string[]): string[] {
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const p = loop[i], q = loop[(i + 1) % n];
    if (p === a && q === b) return [...loop.slice(0, i + 1), ...ids, ...loop.slice(i + 1)];
    if (p === b && q === a) return [...loop.slice(0, i + 1), ...[...ids].reverse(), ...loop.slice(i + 1)];
  }
  return loop;
}

/** 在邊上最接近 at 的位置插頂點（整數 px），寫進所有共用該邊的環 */
export function insertVertexOnEdge(model: Model, edge: Edge, at: XY): Model {
  const { A, u, L } = edgeFrame(model, edge);
  const t = Math.min(L - 0.5, Math.max(0.5, (at[0] - A.x) * u[0] + (at[1] - A.y) * u[1]));
  const id = newId('n');
  return {
    ...model,
    vertices: { ...model.vertices, [id]: { id, x: Math.round(A.x + u[0] * t), y: Math.round(A.y + u[1] * t) } },
    regions: model.regions.map((r) => (edge.regions.includes(r.id) ? { ...r, loop: insertBetween(r.loop, edge.a, edge.b, [id]) } : r)),
  };
}

export interface BumpSpec { width: number; height: number; t: number; fromRegion: string }

/** 插入 4 個頂點形成凸起（由 fromRegion 往外凸）；height < 0 為凹陷 */
export function insertBump(model: Model, edge: Edge, spec: BumpSpec): Model {
  const { A, L, u, n } = edgeFrame(model, edge, spec.fromRegion);
  const w = Math.min(spec.width, L - 1);
  const s = Math.min(L - 0.5 - w, Math.max(0.5, spec.t * L - w / 2));
  const at = (along: number, out: number): XY => [Math.round(A.x + u[0] * along + n[0] * out), Math.round(A.y + u[1] * along + n[1] * out)];
  const pts = [at(s, 0), at(s, spec.height), at(s + w, spec.height), at(s + w, 0)];
  const ids = pts.map(() => newId('n'));
  const vertices = { ...model.vertices };
  ids.forEach((id, i) => (vertices[id] = { id, x: pts[i][0], y: pts[i][1] }));
  return {
    ...model,
    vertices,
    regions: model.regions.map((r) => (edge.regions.includes(r.id) ? { ...r, loop: insertBetween(r.loop, edge.a, edge.b, ids) } : r)),
  };
}
