/**
 * 參數化元件：三個剖面的範例結構與 prototype 完全相同（尺寸、區域 id、標籤、材質、順序）。
 * prototype 的三個剖面尺寸彼此並不一致（例如 X-Cut Lg = 30、Z-Cut Lg = 20），
 * 所以共用參數以「相對 prototype 的變化量 Δ」連動：Doc.params 存的是 Δ，
 * 每個剖面顯示的值 = 該剖面原尺寸 + Δ。
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
  { key: 'Tsp', label: 'Spacer', desc: 'Spacer 厚度', cuts: ['x'] },
  { key: 'Wfin', label: 'Wfin', desc: 'Fin 寬度', cuts: ['y', 'z'] },
  { key: 'Pf', label: 'Fin pitch', desc: 'Fin 間距', cuts: ['y', 'z'] },
  { key: 'Hfin', label: 'Hfin', desc: 'Fin 高度', cuts: ['x', 'y'] },
  { key: 'Hg', label: 'Gate 高', desc: 'Gate 高度', cuts: ['x', 'y'] },
  { key: 'Tox', label: 'Tox', desc: '閘極氧化層厚度', cuts: ['x'] },
];

/** prototype 各剖面的原尺寸 */
export const NOMINAL: Record<CutId, Partial<Params>> = {
  x: { Lg: 30, Pg: 120, Tsp: 10, Hfin: 25, Hg: 60, Tox: 2 },
  y: { Wfin: 20, Pf: 75, Hfin: 40, Hg: 35 },
  z: { Lg: 20, Pg: 100, Wfin: 20, Pf: 80 },
};

export const ZERO_DELTA: Params = { Lg: 0, Pg: 0, Tsp: 0, Wfin: 0, Pf: 0, Hfin: 0, Hg: 0, Tox: 0 };

/** 參數在某剖面的實際值（不在該剖面的參數回傳 undefined） */
export function valueIn(cut: CutId, key: ParamKey, d: Params): number | undefined {
  const n = NOMINAL[cut][key];
  return n === undefined ? undefined : n + d[key];
}

/** 面板顯示用：目前剖面有這個參數就用目前剖面，否則用第一個有它的剖面 */
export function displayCut(cut: CutId, key: ParamKey): CutId {
  const def = PARAM_DEFS.find((p) => p.key === key)!;
  return def.cuts.includes(cut) ? cut : def.cuts[0];
}

const abs = (cut: CutId, d: Params) => {
  const out = {} as Params;
  for (const k of Object.keys(ZERO_DELTA) as ParamKey[]) out[k] = (NOMINAL[cut][k] ?? 0) + d[k];
  return out;
};

/** 某剖面中，其他參數固定時這個參數的合法實際值範圍（Q11：只擋參數範圍） */
function absRange(cut: CutId, key: ParamKey, p: Params): [number, number] {
  if (cut === 'x') {
    switch (key) {
      case 'Lg': return [4, Math.min(p.Pg - 2 * p.Tsp - 20, 2 * (60 - p.Tsp))];
      case 'Pg': return [p.Lg + 2 * p.Tsp + 20, 300];
      case 'Tsp': return [1, Math.min((p.Pg - p.Lg - 20) / 2, 60 - p.Lg / 2)];
      case 'Hfin': return [5, 150];
      case 'Hg': return [5, 200];
      case 'Tox': return [0.5, 10];
    }
  }
  if (cut === 'y') {
    switch (key) {
      case 'Wfin': return [4, Math.min(p.Pf - 4, 2 * (p.Pf - 24))];
      case 'Pf': return [Math.max(p.Wfin + 4, p.Wfin / 2 + 24), 200];
      case 'Hfin': return [12, 150];
      case 'Hg': return [5, 200];
    }
  }
  if (cut === 'z') {
    switch (key) {
      case 'Lg': return [4, Math.min(p.Pg - 4, 152)];
      case 'Pg': return [p.Lg + 4, 300];
      case 'Wfin': return [4, Math.min(p.Pf - 4, 92)];
      case 'Pf': return [p.Wfin + 4, 200];
    }
  }
  return [-Infinity, Infinity];
}

/** Δ 的合法範圍：所有用到這個參數的剖面範圍取交集 */
export function deltaRange(key: ParamKey, d: Params): [number, number] {
  let lo = -Infinity, hi = Infinity;
  for (const cut of PARAM_DEFS.find((p) => p.key === key)!.cuts) {
    const [a, b] = absRange(cut, key, abs(cut, d));
    const n = NOMINAL[cut][key]!;
    lo = Math.max(lo, a - n);
    hi = Math.min(hi, b - n);
  }
  return [lo, hi];
}

/** 設定 Δ（夾在合法範圍內，進位到 0.1 nm） */
export function setParam(d: Params, key: ParamKey, delta: number): Params {
  const [lo, hi] = deltaRange(key, d);
  const v = Math.round(Math.min(hi, Math.max(lo, delta)) * 10) / 10;
  return { ...d, [key]: v };
}

// ---------- 產生器（prototype 的範例結構，尺寸改由參數決定） ----------

function genX(d: Params): Model {
  const { Lg, Pg, Tsp, Hfin, Hg, Tox } = abs('x', d);
  const W = 160 + 2 * Pg;
  const centers = [0, 1, 2].map((i) => 80 + i * Pg);
  const a = (c: number) => c - Lg / 2;
  const b = (c: number) => c + Lg / 2;
  const yG = -(Tox + Hg); // gate／spacer 頂
  const yT = yG - 13; // cap ILD 頂
  const s: RegionSpec[] = [];
  s.push({ id: 'sub', label: 'Si 基板', material: 'si', kind: 'sub', pts: rect(0, Hfin, W, Hfin + 75) });
  const h = [0, ...centers.flatMap((c) => [a(c), b(c)]), W];
  for (let g = 0; g < h.length - 1; g++) {
    const ch = g % 2 === 1;
    s.push({
      id: (ch ? 'ch' : 'sd') + g,
      label: ch ? 'Channel' : g === 0 ? 'Source' : g === h.length - 2 ? 'Drain' : 'S/D',
      material: ch ? 'si' : 'si_n',
      kind: ch ? 'ch' : 'sd',
      pts: rect(h[g], 0, h[g + 1], Hfin),
    });
  }
  centers.forEach((c, v) => {
    s.push({ id: `ox${v}`, label: 'Gate oxide', material: 'sio2', kind: 'ox', pts: rect(a(c) - Tsp, -Tox, b(c) + Tsp, 0) });
    s.push({ id: `spL${v}`, label: 'Spacer', material: 'sin', kind: 'sp', pts: rect(a(c) - Tsp, yG, a(c), -Tox) });
    s.push({ id: `g${v}`, label: `Poly gate ${v + 1}`, material: 'poly', kind: 'gate', pts: rect(a(c), yG, b(c), -Tox) });
    s.push({ id: `spR${v}`, label: 'Spacer', material: 'sin', kind: 'sp', pts: rect(b(c), yG, b(c) + Tsp, -Tox) });
    s.push({ id: `cap${v}`, label: 'ILD', material: 'sio2', kind: 'cap', pts: rect(a(c) - Tsp, yT, b(c) + Tsp, yG) });
  });
  const gaps: [number, number][] = [
    [0, a(centers[0]) - Tsp],
    ...centers.slice(0, -1).map((c, v): [number, number] => [b(c) + Tsp, a(centers[v + 1]) - Tsp]),
    [b(centers[2]) + Tsp, W],
  ];
  gaps.forEach(([g0, g1], i) => {
    const m = (g0 + g1) / 2;
    s.push({ id: `ildL${i}`, label: 'ILD', material: 'sio2', kind: 'ild', pts: rect(g0, yT, m - 8, 0) });
    s.push({ id: `ct${i}`, label: 'W 接觸', material: 'w', kind: 'ct', pts: rect(m - 8, yT, m + 8, 0) });
    s.push({ id: `ildR${i}`, label: 'ILD', material: 'sio2', kind: 'ild', pts: rect(m + 8, yT, g1, 0) });
  });
  return buildModel(s, { x0: 0, x1: W, yTop: yT - 35, yBot: Hfin + 85 });
}

function genY(d: Params): Model {
  const { Wfin, Pf, Hfin, Hg } = abs('y', d);
  const W = 4 * Pf;
  const T = -Hfin; // fin 尖端
  const hw = Wfin / 2;
  const fins = [0, 1, 2].map((j) => Pf * (j + 1));
  const tip = (c: number): XY[] => [
    [c + hw, T + 10], [c + 0.35 * Wfin, T + 3], [c, T], [c - 0.35 * Wfin, T + 3], [c - hw, T + 10],
  ];
  const s: RegionSpec[] = [];
  s.push({ id: 'sub', label: 'Si 基板', material: 'si', kind: 'sub', pts: rect(0, 40, W, 100) });
  fins.forEach((c, m) => {
    s.push({ id: `fin${m}`, label: `Fin ${m + 1}`, material: 'fin', kind: 'fin', pts: [[c - hw, 40], [c + hw, 40], [c + hw, 0], ...tip(c), [c - hw, 0]] });
  });
  const a = [0, ...fins.flatMap((c) => [c - hw, c + hw]), W];
  for (let i = 0; i < a.length - 1; i += 2) {
    s.push({ id: `sti${i}`, label: 'STI', material: 'sio2', kind: 'sti', pts: rect(a[i], 0, a[i + 1], 40) });
  }
  const yG = T - Hg;
  const gate: XY[] = [[20, 0]];
  fins.forEach((c) => gate.push([c - hw, 0], ...[...tip(c)].reverse(), [c + hw, 0]));
  gate.push([W - 20, 0], [W - 20, yG], [20, yG]);
  s.push({ id: 'gate', label: 'Poly gate（包覆 3 fin）', material: 'poly', kind: 'gate', pts: gate });
  s.push({ id: 'hm', label: 'Hard mask', material: 'sin', kind: 'hm', pts: rect(20, yG - 12, W - 20, yG) });
  return buildModel(s, { x0: 0, x1: W, yTop: yG - 25, yBot: 100 });
}

function genZ(d: Params): Model {
  const { Lg, Pg, Wfin, Pf } = abs('z', d);
  const W = 160 + 2 * Pg;
  const H = 100 + 2 * Pf;
  const xs = [0, ...[0, 1, 2].flatMap((i) => [80 + i * Pg - Lg / 2, 80 + i * Pg + Lg / 2]), W];
  const ys = [0, ...[0, 1, 2].flatMap((j) => [50 + j * Pf - Wfin / 2, 50 + j * Pf + Wfin / 2]), H];
  const s: RegionSpec[] = [];
  for (let r = 0; r < xs.length - 1; r++) {
    for (let l = 0; l < ys.length - 1; l++) {
      const o = r % 2 === 1, i = l % 2 === 1;
      s.push({
        id: `c${r}${l}`,
        label: o && i ? '通道' : o ? 'Gate' : i ? 'Fin' : 'STI',
        material: o ? 'poly' : i ? 'fin' : 'sio2',
        kind: `${o ? 'g' : 'sd'}:${i ? 'fin' : 'sti'}`,
        pts: rect(xs[r], ys[l], xs[r + 1], ys[l + 1]),
      });
    }
  }
  return buildModel(s, { x0: 0, x1: W, yTop: 0, yBot: H });
}

export const CUTS: { id: CutId; name: string; desc: string; gen: (d: Params) => Model }[] = [
  { id: 'x', name: 'X-Cut', desc: '沿通道：3 個 poly gate + W 接觸', gen: genX },
  { id: 'y', name: 'Y-Cut', desc: '跨 Fin：3 根 fin 同一 gate 包覆', gen: genY },
  { id: 'z', name: 'Z-Cut', desc: '俯視：3 gate 線 × 3 fin', gen: genZ },
];

const genOf = (cut: CutId) => CUTS.find((c) => c.id === cut)!.gen;

export function initialDoc(): Doc {
  const d = ZERO_DELTA;
  return { params: d, cuts: { x: genX(d), y: genY(d), z: genZ(d) } };
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

/** 參數從 doc.params 改成 pNew：三個剖面一起套用 */
export function applyParams(doc: Doc, pNew: Params): Doc {
  const pOld = doc.params;
  const cuts = { ...doc.cuts };
  for (const { id, gen } of CUTS) cuts[id] = shiftModel(doc.cuts[id], gen(pOld), gen(pNew));
  return { params: pNew, cuts };
}

// ---------- 綁定 ----------

/** 依相鄰兩區域的 kind 列出這條邊「可能」綁的參數；實際是否綁定再看靈敏度 */
function candidates(cut: CutId, kinds: string[]): ParamKey[] {
  if (cut === 'z') {
    if (kinds.length < 2) return [];
    const [ca, ra] = kinds[0].split(':');
    const [cb, rb] = kinds[1].split(':');
    if (ra !== rb && ca === cb) return ['Wfin'];
    if (ca !== cb && ra === rb) return ['Lg'];
    return [];
  }
  const pair = kinds.length < 2 ? `${kinds[0]}|-` : [...kinds].sort().join('|');
  const table: Record<string, ParamKey[]> =
    cut === 'x'
      ? {
          'gate|sp': ['Lg'], 'ch|sd': ['Lg'],
          'gate|ox': ['Tox'], 'ox|sp': ['Tox'],
          'ild|ox': ['Tsp'], 'ild|sp': ['Tsp'], 'cap|ild': ['Tsp'],
          'cap|gate': ['Hg'], 'cap|sp': ['Hg'], 'cap|-': ['Hg'], 'ild|-': ['Hg'], 'ct|-': ['Hg'],
          'ch|sub': ['Hfin'], 'sd|sub': ['Hfin'],
        }
      : {
          'fin|gate': ['Wfin', 'Hfin'], 'fin|sti': ['Wfin'],
          'gate|hm': ['Hg'], 'hm|-': ['Hg'],
        };
  return table[pair] ?? [];
}

export type Sensitivity = Record<ParamKey, Record<string, XY>>;

/** 每個參數 +1 nm 時，產生器各頂點的位移 */
export function sensitivity(cut: CutId, d: Params): Sensitivity {
  const gen = genOf(cut);
  const base = gen(d);
  const h = 0.01;
  const out = {} as Sensitivity;
  for (const { key } of PARAM_DEFS) {
    const g = gen({ ...d, [key]: d[key] + h });
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

/** 邊沿法向位移 d 時，參數變化 d / k；邊必須整條沿法向平移（兩端靈敏度相同） */
export function bindingOf(cut: CutId, model: Model, edge: Edge, sens: Sensitivity): Binding | undefined {
  const kinds = edge.regions.map((id) => model.regions.find((r) => r.id === id)?.kind ?? '');
  for (const param of candidates(cut, kinds)) {
    const sa = sens[param][edge.a], sb = sens[param][edge.b];
    if (!sa || !sb) continue;
    const { normal } = edgeFrame(model, edge);
    const ka = sa[0] * normal[0] + sa[1] * normal[1];
    const kb = sb[0] * normal[0] + sb[1] * normal[1];
    if (Math.abs(ka) < 1e-3 || Math.abs(ka - kb) > 1e-3) continue;
    return { param, k: (ka + kb) / 2, normal };
  }
  return undefined;
}
