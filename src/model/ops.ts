import { edgeFrame } from './geometry';
import type { Edge, Model, XY } from './types';

let uid = 0;
const newId = () => `u${++uid}`;

/** 位移頂點，回傳新 model（immutable） */
export function moveVertices(model: Model, delta: Map<string, XY>): Model {
  if (!delta.size) return model;
  const vertices = { ...model.vertices };
  delta.forEach(([dx, dy], id) => {
    const v = vertices[id];
    if (v) vertices[id] = { id, x: v.x + dx, y: v.y + dy };
  });
  return { ...model, vertices };
}

export function setVertexPos(model: Model, id: string, [x, y]: XY): Model {
  if (!model.vertices[id]) return model;
  return { ...model, vertices: { ...model.vertices, [id]: { id, x, y } } };
}

/** 在環中 a→b（或 b→a）相鄰處插入 ids（ids 依 a→b 順序） */
function insertBetween(loop: string[], a: string, b: string, ids: string[]): string[] {
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const p = loop[i];
    const q = loop[(i + 1) % n];
    if (p === a && q === b) return [...loop.slice(0, i + 1), ...ids, ...loop.slice(i + 1)];
    if (p === b && q === a) return [...loop.slice(0, i + 1), ...[...ids].reverse(), ...loop.slice(i + 1)];
  }
  return loop;
}

function insertOnEdge(model: Model, edge: Edge, pts: XY[]): { model: Model; ids: string[] } {
  const ids = pts.map(() => newId());
  const vertices = { ...model.vertices };
  ids.forEach((id, i) => (vertices[id] = { id, x: pts[i][0], y: pts[i][1] }));
  const regions = model.regions.map((r) =>
    edge.regions.includes(r.id) ? { ...r, loop: insertBetween(r.loop, edge.a, edge.b, ids) } : r,
  );
  return { model: { ...model, vertices, regions }, ids };
}

/** 在邊上插頂點，寫進所有共用該邊的環 */
export function insertVertexOnEdge(model: Model, edge: Edge, at: XY): { model: Model; id: string } {
  const r = insertOnEdge(model, edge, [at]);
  return { model: r.model, id: r.ids[0] };
}

export interface BumpSpec { width: number; height: number; t: number; fromRegion: string }

/** 插入 4 個頂點形成凸起（由 fromRegion 往外凸）；height < 0 為凹陷 */
export function insertBump(model: Model, edge: Edge, spec: BumpSpec): Model {
  const { dir, normal, length } = edgeFrame(model, edge, spec.fromRegion);
  const a = model.vertices[edge.a];
  const w = Math.min(Math.max(spec.width, 0.1), length - 0.2);
  const s0 = Math.min(Math.max(spec.t * length - w / 2, 0.1), length - w - 0.1);
  const p1: XY = [a.x + dir[0] * s0, a.y + dir[1] * s0];
  const p4: XY = [p1[0] + dir[0] * w, p1[1] + dir[1] * w];
  const h = spec.height;
  const p2: XY = [p1[0] + normal[0] * h, p1[1] + normal[1] * h];
  const p3: XY = [p4[0] + normal[0] * h, p4[1] + normal[1] * h];
  return insertOnEdge(model, edge, [p1, p2, p3, p4]).model;
}

export function setMaterial(model: Model, regionIds: string[], material: string): Model {
  return { ...model, regions: model.regions.map((r) => (regionIds.includes(r.id) ? { ...r, material } : r)) };
}
