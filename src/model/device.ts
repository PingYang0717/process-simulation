/**
 * 參數化元件：三個剖面都由同一組共用參數產生。
 * 連動規則（Demo 決議 Q3/Q5）：參數改變時，各剖面只把「產生器裡存在的頂點」
 * 位移「新舊產生結果的差」，使用者插入的頂點與其他自由編輯保留不動。
 */
import { buildModel, rect } from './build';
import { edgeFrame } from './geometry';
import type { CutId, Doc, Edge, Model, ParamKey, Params, RegionSpec, XY } from './types';

export interface ParamDef { key: ParamKey; label: string; desc: string; cuts: CutId[] }

export const PARAM_DEFS: ParamDef[] = [
  { key: 'Lg', label: 'Lg', desc: 'Gate 長度', cuts: ['x', 'z'] },
  { key: 'Pg', label: 'Gate pitch', desc: 'Gate 間距', cuts: ['x', 'z'] },
  { key: 'Tsp', label: 'Spacer', desc: 'Spacer 厚度', cuts: ['x', 'z'] },
  { key: 'Wfin', label: 'Wfin', desc: 'Fin 寬度', cuts: ['y', 'z'] },
  { key: 'Pf', label: 'Fin pitch', desc: 'Fin 間距', cuts: ['y', 'z'] },
  { key: 'Hfin', label: 'Hfin', desc: 'Fin 高度', cuts: ['x', 'y'] },
  { key: 'Hg', label: 'Gate 高', desc: 'Gate 高度（fin 頂以上）', cuts: ['x', 'y'] },
  { key: 'Tox', label: 'Tox', desc: '閘極氧化層厚度', cuts: ['x', 'y'] },
];

export const DEFAULT_PARAMS: Params = { Lg: 20, Pg: 90, Tsp: 8, Wfin: 10, Pf: 40, Hfin: 40, Hg: 50, Tox: 2 };

const SUB = 30; // 基板顯示厚度，固定

/** 各參數在其他參數固定下的合法範圍（Q11：只擋參數範圍） */
export function paramRange(key: ParamKey, p: Params): [number, number] {
  switch (key) {
    case 'Lg': return [4, p.Pg - 2 * p.Tsp - 4];
    case 'Pg': return [p.Lg + 2 * p.Tsp + 4, 250];
    case 'Tsp': return [1, (p.Pg - p.Lg - 4) / 2];
    case 'Wfin': return [3, p.Pf - 2 * p.Tox - 4];
    case 'Pf': return [p.Wfin + 2 * p.Tox + 4, 200];
    case 'Hfin': return [5, 150];
    case 'Hg': return [5, 200];
    case 'Tox': return [0.5, Math.min(10, (p.Pf - p.Wfin - 4) / 2)];
  }
}

export function setParam(p: Params, key: ParamKey, value: number): Params {
  const [lo, hi] = paramRange(key, p);
  const v = Math.round(Math.min(hi, Math.max(lo, value)) * 10) / 10;
  return { ...p, [key]: v };
}

// ---------- 產生器 ----------

function genX(p: Params): Model {
  const yT = -(p.Tox + p.Hg);
  const W = 3 * p.Pg;
  const specs: RegionSpec[] = [];
  const gates = [0, 1, 2].map((i) => {
    const c = p.Pg / 2 + i * p.Pg;
    return { gl: c - p.Lg / 2, gr: c + p.Lg / 2 };
  });
  gates.forEach(({ gl, gr }, i) => {
    specs.push({ id: `g${i}`, label: `Poly gate ${i + 1}`, material: 'poly', kind: 'gate', pts: rect(gl, yT, gr, -p.Tox) });
    specs.push({ id: `ox${i}`, label: 'Gate oxide', material: 'sio2', kind: 'ox', pts: rect(gl, -p.Tox, gr, 0) });
    specs.push({ id: `spL${i}`, label: 'Spacer', material: 'sin', kind: 'sp', pts: rect(gl - p.Tsp, yT, gl, 0) });
    specs.push({ id: `spR${i}`, label: 'Spacer', material: 'sin', kind: 'sp', pts: rect(gr, yT, gr + p.Tsp, 0) });
  });
  const ildX = [0, ...gates.flatMap(({ gl, gr }) => [gl - p.Tsp, gr + p.Tsp]), W];
  for (let i = 0; i < ildX.length; i += 2) {
    specs.push({ id: `ild${i / 2}`, label: 'ILD', material: 'sio2', kind: 'ild', pts: rect(ildX[i], yT, ildX[i + 1], 0) });
  }
  const finX = [0, ...gates.flatMap(({ gl, gr }) => [gl, gr]), W];
  for (let i = 0; i < finX.length - 1; i++) {
    const ch = i % 2 === 1;
    const k = Math.floor(i / 2);
    const label = ch ? `Channel ${k + 1}` : i === 0 ? 'Source' : i === finX.length - 2 ? 'Drain' : 'S/D';
    specs.push({
      id: ch ? `ch${k}` : `sd${k}`,
      label,
      material: ch ? 'fin' : 'si_n',
      kind: ch ? 'ch' : 'sd',
      pts: rect(finX[i], 0, finX[i + 1], p.Hfin),
    });
  }
  specs.push({ id: 'sub', label: 'Si 基板', material: 'si', kind: 'sub', pts: rect(0, p.Hfin, W, p.Hfin + SUB) });
  return buildModel(specs, { x0: 0, x1: W, yTop: yT, yBot: p.Hfin + SUB });
}

function genY(p: Params): Model {
  const yT = -(p.Tox + p.Hg);
  const W = 3 * p.Pf;
  const hw = p.Wfin / 2;
  const fins = [0, 1, 2].map((j) => p.Pf / 2 + j * p.Pf);
  const specs: RegionSpec[] = [];
  specs.push({ id: 'sub', label: 'Si 基板', material: 'si', kind: 'sub', pts: rect(0, p.Hfin, W, p.Hfin + SUB) });
  fins.forEach((fx, j) => {
    specs.push({ id: `fin${j}`, label: `Fin ${j + 1}`, material: 'fin', kind: 'fin', pts: rect(fx - hw, 0, fx + hw, p.Hfin) });
    const o = hw + p.Tox;
    specs.push({
      id: `ox${j}`,
      label: 'Gate oxide',
      material: 'sio2',
      kind: 'ox',
      pts: [
        [fx - o, p.Hfin], [fx - o, -p.Tox], [fx + o, -p.Tox], [fx + o, p.Hfin],
        [fx + hw, p.Hfin], [fx + hw, 0], [fx - hw, 0], [fx - hw, p.Hfin],
      ],
    });
  });
  const gate: XY[] = [[0, yT], [W, yT], [W, p.Hfin]];
  [...fins].reverse().forEach((fx) => {
    const o = hw + p.Tox;
    gate.push([fx + o, p.Hfin], [fx + o, -p.Tox], [fx - o, -p.Tox], [fx - o, p.Hfin]);
  });
  gate.push([0, p.Hfin]);
  specs.push({ id: 'gate', label: 'Poly gate（包覆 3 fin）', material: 'poly', kind: 'gate', pts: gate });
  return buildModel(specs, { x0: 0, x1: W, yTop: yT, yBot: p.Hfin + SUB });
}

function genZ(p: Params): Model {
  const W = 3 * p.Pg;
  const H = 3 * p.Pf;
  const xs = [0];
  const cols: string[] = [];
  [0, 1, 2].forEach((i) => {
    const c = p.Pg / 2 + i * p.Pg;
    xs.push(c - p.Lg / 2 - p.Tsp, c - p.Lg / 2, c + p.Lg / 2, c + p.Lg / 2 + p.Tsp);
    cols.push('sd', 'sp', 'g', 'sp');
  });
  xs.push(W);
  cols.push('sd');
  const ys = [0];
  const rows: string[] = [];
  [0, 1, 2].forEach((j) => {
    const c = p.Pf / 2 + j * p.Pf;
    ys.push(c - p.Wfin / 2, c + p.Wfin / 2);
    rows.push('sti', 'fin');
  });
  ys.push(H);
  rows.push('sti');
  const specs: RegionSpec[] = [];
  cols.forEach((col, ci) =>
    rows.forEach((row, ri) => {
      const fin = row === 'fin';
      const [label, material] =
        col === 'g' ? (fin ? ['通道（gate 下）', 'poly'] : ['Gate', 'poly'])
        : col === 'sp' ? ['Spacer', 'sin']
        : fin ? ['Fin S/D', 'si_n'] : ['STI', 'sio2'];
      specs.push({ id: `c${ci}_${ri}`, label, material, kind: `${col}:${row}`, pts: rect(xs[ci], ys[ri], xs[ci + 1], ys[ri + 1]) });
    }),
  );
  return buildModel(specs, { x0: 0, x1: W, yTop: 0, yBot: H });
}

export const CUTS: { id: CutId; name: string; desc: string; gen: (p: Params) => Model }[] = [
  { id: 'x', name: 'X-Cut', desc: '沿通道：3 個 poly gate', gen: genX },
  { id: 'y', name: 'Y-Cut', desc: '跨 Fin：3 根 fin 同一 gate 包覆', gen: genY },
  { id: 'z', name: 'Z-Cut', desc: '俯視：3 gate 線 × 3 fin', gen: genZ },
];

const genOf = (cut: CutId) => CUTS.find((c) => c.id === cut)!.gen;

export function initialDoc(params: Params = DEFAULT_PARAMS): Doc {
  return { params, cuts: { x: genX(params), y: genY(params), z: genZ(params) } };
}

// ---------- 連動 ----------

function shiftModel(model: Model, gOld: Model, gNew: Model): Model {
  const vertices = { ...model.vertices };
  for (const id in gOld.vertices) {
    const v = vertices[id];
    const a = gOld.vertices[id];
    const b = gNew.vertices[id];
    if (!v || !b) continue;
    vertices[id] = { id, x: v.x + (b.x - a.x), y: v.y + (b.y - a.y) };
  }
  const w = model.world, wo = gOld.world, wn = gNew.world;
  return {
    ...model,
    vertices,
    world: { x0: w.x0 + wn.x0 - wo.x0, x1: w.x1 + wn.x1 - wo.x1, yTop: w.yTop + wn.yTop - wo.yTop, yBot: w.yBot + wn.yBot - wo.yBot },
  };
}

/** 參數從 pOld 改成 pNew：三個剖面一起套用 */
export function applyParams(doc: Doc, pNew: Params): Doc {
  const pOld = doc.params;
  const cuts = { ...doc.cuts };
  for (const { id, gen } of CUTS) cuts[id] = shiftModel(doc.cuts[id], gen(pOld), gen(pNew));
  return { params: pNew, cuts };
}

// ---------- 綁定 ----------

/** 依相鄰兩區域的 kind 決定這條邊「可能」綁哪個參數；實際是否綁定再看靈敏度 */
function candidates(cut: CutId, kinds: string[]): ParamKey | undefined {
  if (cut === 'z') {
    if (kinds.length < 2) return undefined;
    const [ca, ra] = kinds[0].split(':');
    const [cb, rb] = kinds[1].split(':');
    if (ra !== rb && ca === cb) return 'Wfin';
    if (ca !== cb && ra === rb) {
      const pair = [ca, cb].sort().join('|');
      if (pair === 'g|sp') return 'Lg';
      if (pair === 'sd|sp') return 'Tsp';
    }
    return undefined;
  }
  const pair = kinds.length < 2 ? `${kinds[0]}|-` : [...kinds].sort().join('|');
  const table: Record<string, ParamKey> =
    cut === 'x'
      ? { 'gate|sp': 'Lg', 'ch|sd': 'Lg', 'ox|sp': 'Lg', 'ild|sp': 'Tsp', 'gate|ox': 'Tox', 'ch|sub': 'Hfin', 'sd|sub': 'Hfin', 'gate|-': 'Hg', 'ild|-': 'Hg', 'sp|-': 'Hg' }
      : { 'fin|ox': 'Wfin', 'gate|ox': 'Tox', 'fin|sub': 'Hfin', 'ox|sub': 'Hfin', 'gate|sub': 'Hfin', 'gate|-': 'Hg' };
  return table[pair];
}

export type Sensitivity = Record<ParamKey, Record<string, XY>>;

/** 每個參數 +1 nm 時，產生器各頂點的位移 */
export function sensitivity(cut: CutId, p: Params): Sensitivity {
  const gen = genOf(cut);
  const base = gen(p);
  const h = 0.01;
  const out = {} as Sensitivity;
  for (const { key } of PARAM_DEFS) {
    const g = gen({ ...p, [key]: p[key] + h });
    const m: Record<string, XY> = {};
    for (const id in base.vertices) {
      const a = base.vertices[id], b = g.vertices[id];
      if (b) m[id] = [(b.x - a.x) / h, (b.y - a.y) / h];
    }
    out[key] = m;
  }
  return out;
}

export interface Binding { param: ParamKey; k: number; normal: XY }

/** 邊沿法向位移 d 時，參數變化 d / k */
export function bindingOf(cut: CutId, model: Model, edge: Edge, sens: Sensitivity): Binding | undefined {
  const kinds = edge.regions.map((id) => model.regions.find((r) => r.id === id)?.kind ?? '');
  const param = candidates(cut, kinds);
  if (!param) return undefined;
  const sa = sens[param][edge.a], sb = sens[param][edge.b];
  if (!sa || !sb) return undefined;
  const { normal } = edgeFrame(model, edge);
  const ka = sa[0] * normal[0] + sa[1] * normal[1];
  const kb = sb[0] * normal[0] + sb[1] * normal[1];
  if (Math.abs(ka) < 1e-3 || Math.abs(ka - kb) > 1e-3) return undefined;
  return { param, k: (ka + kb) / 2, normal };
}
