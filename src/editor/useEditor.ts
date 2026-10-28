import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isCorner, propagateLayers, smoothEdgeGroup, violates } from '../model/drag';
import { bboxOf, edgeFrame, edgeKey, edgesOf, pointInPoly, polyOf, ringsOf } from '../model/geometry';
import { clampToWorld, detachRegions, insertVertexOnEdge, moveVertices } from '../model/ops';
import type { CutId, CutState, Edge, Imported, Model, XY } from '../model/types';
import { demoX, demoY, demoZ } from '../raster/demo';
import { importRaster } from '../raster/importRaster';
import type { RasterImage } from '../model/types';
import { counterparts } from './mirror';
import { MAX_S, MIN_S } from './view';
import type { Size, View } from './view';

const HISTORY_MAX = 50;
/** 游標吸附半徑（螢幕 px）：頂點 7、邊 6 */
const SNAP_VERTEX = 7, SNAP_EDGE = 6;

export const CUTS: { id: CutId; name: string; desc: string; demo: () => RasterImage }[] = [
  { id: 'x', name: 'X-Cut', desc: '沿通道：3 根 poly gate', demo: demoX },
  { id: 'y', name: 'Y-Cut', desc: '跨 fin：3 根 fin', demo: demoY },
  { id: 'z', name: 'Z-Cut', desc: '俯視', demo: demoZ },
];

const initialCuts = (): Record<CutId, CutState> => {
  const out = {} as Record<CutId, CutState>;
  for (const c of CUTS) {
    const imported = importRaster(c.demo(), 0.5);
    out[c.id] = { imported, model: imported.model, history: [], future: [], baseline: null };
  }
  return out;
};

export interface Mods { shift: boolean; ctrl: boolean; alt: boolean }
/** 按住 V/E/R：暫時只抓頂點／邊／區域 */
export type Hold = 'V' | 'E' | 'R' | null;
type Pt = { x: number; y: number };
export type Hit =
  | { kind: 'none' }
  | { kind: 'vertex'; id: string; region: string }
  | { kind: 'edge'; key: string; region: string; group: string[] }
  | { kind: 'region'; id: string };
type Gesture =
  | { kind: 'move'; startModel: Model; start: Pt; cur: Pt; vertexIds: string[]; regionIds: string[]; detach: boolean; moved: boolean; edgeN?: XY; base?: Model }
  | { kind: 'box'; start: Pt; cur: Pt; additive: boolean };

const ringVertices = (model: Model, ids: string[]) => {
  const out = new Set<string>();
  model.regions.filter((r) => ids.includes(r.id)).forEach((r) => ringsOf(r).forEach((ring) => ring.forEach((v) => out.add(v))));
  return [...out];
};

/** 邊群組 → 要動的頂點：多條邊時只取被兩條以上共用的內部頂點（兩端的角當錨點） */
const edgeGroupVertices = (keys: string[]) => {
  const count = new Map<string, number>();
  keys.forEach((k) => k.split('|').forEach((v) => count.set(v, (count.get(v) ?? 0) + 1)));
  if (keys.length <= 1) return [...count.keys()];
  const inner = [...count.entries()].filter(([, c]) => c > 1).map(([v]) => v);
  return inner.length ? inner : [...count.keys()];
};

export function useEditor() {
  const [cut, setCutState] = useState<CutId>('x');
  const [cuts, setCuts] = useState(initialCuts);
  const cutRef = useRef(cut);
  cutRef.current = cut;
  /** 只改目前方向槽 */
  const patch = useCallback((fn: (s: CutState) => Partial<CutState>) => {
    setCuts((all) => ({ ...all, [cutRef.current]: { ...all[cutRef.current], ...fn(all[cutRef.current]) } }));
  }, []);

  const { imported, model, history, future, baseline } = cuts[cut];
  const materials = imported.materials;
  const [regionSel, setRegionSel] = useState<string[]>([]);
  const [edgeSel, setEdgeSel] = useState<string[]>([]);
  const [vertexSel, setVertexSel] = useState<string[]>([]);
  const [hover, setHover] = useState<Hit>({ kind: 'none' });
  const [hold, setHold] = useState<Hold>(null);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [mirror, setMirror] = useState(true);
  const [follow, setFollow] = useState(true);
  const [followInfo, setFollowInfo] = useState({ layers: 0, blocked: false });
  const [panMode, setPanMode] = useState(false);
  const [view, setView] = useState<View>({ s: 1, tx: 0, ty: 0 });
  const [canvas, setCanvas] = useState<Size>({ w: 600, h: 500 });
  const [menu, setMenu] = useState<{ region: string; x: number; y: number } | null>(null);
  const edges = useMemo(() => edgesOf(model), [model]);
  const edgeByKey = useMemo(() => new Map<string, Edge>(edges.map((e) => [e.key, e])), [edges]);

  // 給 window 事件與 callback 讀最新值
  const modelRef = useRef(model); modelRef.current = model;
  const importedRef = useRef(imported); importedRef.current = imported;
  const gestureRef = useRef(gesture); gestureRef.current = gesture;
  const regionSelRef = useRef(regionSel); regionSelRef.current = regionSel;
  const edgeSelRef = useRef(edgeSel); edgeSelRef.current = edgeSel;
  const vertexSelRef = useRef(vertexSel); vertexSelRef.current = vertexSel;
  const viewRef = useRef(view); viewRef.current = view;
  const canvasRef = useRef(canvas); canvasRef.current = canvas;
  const holdRef = useRef(hold); holdRef.current = hold;
  const shiftRef = useRef(shiftHeld); shiftRef.current = shiftHeld;
  const baselineRef = useRef(baseline); baselineRef.current = baseline;
  const mirrorRef = useRef(mirror); mirrorRef.current = mirror;
  const followRef = useRef(follow); followRef.current = follow;

  const setLive = useCallback((m: Model) => {
    modelRef.current = m;
    patch(() => ({ model: m }));
  }, [patch]);

  /** 參數操作：沒有基準就先記錄，再推歷史、清 future */
  const commit = useCallback((m: Model) => {
    if (!baselineRef.current) patch(() => ({ baseline: { model: modelRef.current, label: '操作前', pinned: false } }));
    const prev = modelRef.current;
    modelRef.current = m;
    patch((s) => ({ model: m, history: [...s.history.slice(-HISTORY_MAX), prev], future: [] }));
  }, [patch]);

  const clearSel = useCallback(() => {
    setRegionSel([]);
    setEdgeSel([]);
    setVertexSel([]);
  }, []);

  const fit = useCallback((w = canvasRef.current.w, h = canvasRef.current.h) => {
    const wd = modelRef.current.world;
    const ww = wd.x1 - wd.x0, wh = wd.yBot - wd.yTop;
    const s = Math.min(w / ww, h / wh) * 0.92;
    setView({ s, tx: (w - ww * s) / 2 - wd.x0 * s, ty: (h - wh * s) / 2 - wd.yTop * s });
  }, []);

  const setCanvasSize = useCallback((w: number, h: number) => {
    const prev = canvasRef.current;
    setCanvas({ w, h });
    if (Math.abs(prev.w - w) > 2 || Math.abs(prev.h - h) > 2) fit(w, h);
  }, [fit]);

  /** 以 (px, py) 為中心縮放，預設畫布中心 */
  const zoomAt = useCallback((factor: number, px?: number, py?: number) => {
    const v = viewRef.current, c = canvasRef.current;
    const cx = px ?? c.w / 2, cy = py ?? c.h / 2;
    const s = Math.min(MAX_S, Math.max(MIN_S, v.s * factor));
    const k = s / v.s;
    setView({ s, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k });
  }, []);
  const setZoom = useCallback((s: number) => zoomAt(s / viewRef.current.s), [zoomAt]);
  const panBy = useCallback((dx: number, dy: number) => setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy })), []);

  const loadImage = useCallback((imp: Imported) => {
    modelRef.current = imp.model;
    patch(() => ({ imported: imp, model: imp.model, history: [], future: [], baseline: null }));
    clearSel();
    setTimeout(() => fit(), 0);
  }, [patch, fit, clearSel]);

  /** 比例只影響顯示，直接改目前槽的 imported */
  const setNmPerPx = useCallback((k: number) => patch((s) => ({ imported: { ...s.imported, nmPerPx: k } })), [patch]);

  const setCut = useCallback((c: CutId) => {
    setCutState(c);
    cutRef.current = c;
    clearSel();
    setMenu(null);
    setTimeout(() => fit(), 0);
  }, [fit, clearSel]);

  // ---------- 聰明游標 ----------

  /** 把手只在已選或游標所在的區域出現 */
  const handleRegions = useCallback((m: Model, at: Pt) => {
    const under = m.regions.filter((r) => pointInPoly([at.x, at.y], polyOf(m, r)));
    const out = new Set(regionSelRef.current);
    if (under.length) out.add(under[under.length - 1].id);
    return out;
  }, []);

  /** 靠近角 → 頂點；靠近邊 → 平滑邊；區域內部 → 區域；其他 → none */
  const hitTest = useCallback((at: Pt): Hit => {
    const m = modelRef.current;
    const s = viewRef.current.s;
    const h = holdRef.current;
    const scope = handleRegions(m, at);
    const d2 = (x: number, y: number) => ((x - at.x) * s) ** 2 + ((y - at.y) * s) ** 2;
    if (h !== 'E' && h !== 'R') {
      let best: { id: string; region: string; d: number } | null = null;
      for (const r of m.regions) {
        if (!scope.has(r.id)) continue;
        for (const ring of ringsOf(r))
          for (let i = 0; i < ring.length; i++) {
            const v = m.vertices[ring[i]];
            const d = d2(v.x, v.y);
            if (d > SNAP_VERTEX ** 2 || (best && d >= best.d)) continue;
            if (h !== 'V' && !isCorner(m, ring, i)) continue;
            best = { id: ring[i], region: r.id, d };
          }
      }
      if (best) return { kind: 'vertex', id: best.id, region: best.region };
    }
    if (h !== 'V' && h !== 'R') {
      let best: { a: string; b: string; region: string; d: number } | null = null;
      for (const r of m.regions) {
        if (!scope.has(r.id)) continue;
        for (const ring of ringsOf(r))
          for (let i = 0; i < ring.length; i++) {
            const A = m.vertices[ring[i]], B = m.vertices[ring[(i + 1) % ring.length]];
            const l2 = (B.x - A.x) ** 2 + (B.y - A.y) ** 2 || 1e-9;
            const t = Math.max(0, Math.min(1, ((at.x - A.x) * (B.x - A.x) + (at.y - A.y) * (B.y - A.y)) / l2));
            const d = d2(A.x + t * (B.x - A.x), A.y + t * (B.y - A.y));
            if (d <= SNAP_EDGE ** 2 && (!best || d < best.d)) best = { a: ring[i], b: ring[(i + 1) % ring.length], region: r.id, d };
          }
      }
      if (best) {
        const region = m.regions.find((r) => r.id === best.region)!;
        const group = shiftRef.current ? [edgeKey(best.a, best.b)] : smoothEdgeGroup(m, region, best.a, best.b);
        return { kind: 'edge', key: edgeKey(best.a, best.b), region: best.region, group };
      }
    }
    if (h !== 'V' && h !== 'E') {
      const under = m.regions.filter((r) => pointInPoly([at.x, at.y], polyOf(m, r)));
      if (under.length) return { kind: 'region', id: under[under.length - 1].id };
    }
    return { kind: 'none' };
  }, [handleRegions]);

  const expandMirror = useCallback((kind: 'vertex' | 'edge', item: string, owner: string, scope: string[]) => {
    if (!mirrorRef.current) return [];
    return counterparts(modelRef.current, kind, item, owner, scope);
  }, []);

  /**
   * 位移規則：整塊搬動直接套；連帶開時襯層跟著走；
   * 連帶關時逐步縮小位移直到不穿層。
   */
  const resolveDisp = useCallback((m: Model, ids: string[], d: XY, detach: boolean) => {
    const uniform = (v: XY) => new Map(ids.map((id) => [id, v] as [string, XY]));
    if (detach) return { disp: uniform(d), layers: 0, blocked: false };
    if (followRef.current) {
      const p = propagateLayers(m, uniform(d));
      return { disp: p.disp, layers: p.layers.length, blocked: false };
    }
    const n = Math.max(Math.abs(d[0]), Math.abs(d[1]));
    for (let k = n; k >= 0; k--) {
      const disp = uniform([Math.round((d[0] * k) / (n || 1)), Math.round((d[1] * k) / (n || 1))]);
      if (!violates(m, disp)) return { disp, layers: 0, blocked: k < n };
    }
    return { disp: uniform([0, 0]), layers: 0, blocked: true };
  }, []);

  const markBaseline = useCallback(() => {
    if (!baselineRef.current?.pinned) patch(() => ({ baseline: { model: modelRef.current, label: '拖拉前', pinned: false } }));
  }, [patch]);

  const startMove = useCallback((g: Omit<Extract<Gesture, { kind: 'move' }>, 'kind' | 'startModel' | 'cur' | 'moved'>) => {
    markBaseline();
    const next: Gesture = { kind: 'move', startModel: modelRef.current, cur: g.start, moved: false, ...g };
    gestureRef.current = next;
    setGesture(next);
  }, [markBaseline]);

  const pointerDown = useCallback((at: Pt, mods: Mods) => {
    setMenu(null);
    const m = modelRef.current;
    const hit = hitTest(at);
    if (hit.kind === 'none') {
      const additive = mods.shift || mods.ctrl;
      if (!additive) clearSel();
      const g: Gesture = { kind: 'box', start: at, cur: at, additive };
      gestureRef.current = g;
      setGesture(g);
      return;
    }
    if (hit.kind === 'region') {
      const cur = regionSelRef.current;
      let next: string[];
      if (mods.ctrl) next = cur.includes(hit.id) ? cur.filter((x) => x !== hit.id) : [...cur, hit.id];
      else if (mods.shift) next = cur.includes(hit.id) ? cur : [...cur, hit.id];
      else next = cur.includes(hit.id) ? cur : [hit.id];
      setRegionSel(next);
      setEdgeSel([]);
      setVertexSel([]);
      if (mods.ctrl || !next.includes(hit.id)) return;
      startMove({ start: at, vertexIds: ringVertices(m, next), regionIds: next, detach: true });
      return;
    }
    const scope = regionSelRef.current.includes(hit.region) ? regionSelRef.current : [...regionSelRef.current, hit.region];
    setRegionSel(scope);
    if (hit.kind === 'edge' && mods.alt) {
      const e = edgeByKey.get(hit.key);
      if (e) commit(insertVertexOnEdge(m, e, [Math.round(at.x), Math.round(at.y)]));
      return;
    }
    if (hit.kind === 'edge') {
      const group = [...hit.group];
      hit.group.forEach((k) => group.push(...expandMirror('edge', k, hit.region, scope)));
      const items = [...new Set(group)];
      const cur = edgeSelRef.current;
      const all = items.every((k) => cur.includes(k));
      let next: string[];
      if (mods.ctrl) next = all ? cur.filter((k) => !items.includes(k)) : [...new Set([...cur, ...items])];
      else if (mods.shift) next = [...new Set([...cur, ...items])];
      else next = all ? cur : items;
      setEdgeSel(next);
      setVertexSel([]);
      if (mods.ctrl) return;
      const e = edgeByKey.get(hit.key);
      const edgeN = e && next.length === hit.group.length ? edgeFrame(m, e).n : undefined;
      startMove({ start: at, vertexIds: edgeGroupVertices(next), regionIds: scope, detach: false, edgeN });
      return;
    }
    const items = [hit.id, ...expandMirror('vertex', hit.id, hit.region, scope)];
    const cur = vertexSelRef.current;
    let next: string[];
    if (mods.ctrl) next = cur.includes(hit.id) ? cur.filter((v) => !items.includes(v)) : [...new Set([...cur, ...items])];
    else if (mods.shift) next = [...new Set([...cur, ...items])];
    else next = cur.includes(hit.id) ? cur : items;
    setVertexSel(next);
    setEdgeSel([]);
    if (mods.ctrl) return;
    startMove({ start: at, vertexIds: next, regionIds: scope, detach: false });
  }, [hitTest, clearSel, startMove, edgeByKey, commit, expandMirror]);

  const pointerMove = useCallback((at: Pt) => {
    const g = gestureRef.current;
    if (!g) {
      setHover(hitTest(at));
      return;
    }
    if (g.kind === 'box') {
      const next = { ...g, cur: at };
      gestureRef.current = next;
      setGesture(next);
      return;
    }
    const d: XY = [Math.round(at.x - g.start.x), Math.round(at.y - g.start.y)];
    // 區域整塊拖：第一次移動才分離共用頂點，只點不拖不改模型
    const base = g.base ?? (g.detach ? detachRegions(g.startModel, g.regionIds) : g.startModel);
    const ids = g.detach ? ringVertices(base, g.regionIds) : g.vertexIds;
    const { disp, layers, blocked } = resolveDisp(base, ids, d, g.detach);
    setFollowInfo({ layers, blocked });
    const next = { ...g, base, cur: at, moved: true };
    gestureRef.current = next;
    setGesture(next);
    setLive(clampToWorld(moveVertices(base, disp)));
  }, [hitTest, resolveDisp, setLive]);

  const pointerUp = useCallback(() => {
    const g = gestureRef.current;
    if (!g) return;
    const m = modelRef.current;
    if (g.kind === 'box') {
      const x0 = Math.min(g.start.x, g.cur.x), x1 = Math.max(g.start.x, g.cur.x);
      const y0 = Math.min(g.start.y, g.cur.y), y1 = Math.max(g.start.y, g.cur.y);
      if ((x1 - x0) * viewRef.current.s > 3 || (y1 - y0) * viewRef.current.s > 3) {
        const hits = m.regions
          .filter((r) => {
            const b = bboxOf(polyOf(m, r));
            return b.x0 >= x0 && b.x1 <= x1 && b.y0 >= y0 && b.y1 <= y1;
          })
          .map((r) => r.id);
        setRegionSel((cur) => (g.additive ? [...new Set([...cur, ...hits])] : hits));
      }
    } else if (g.moved && g.startModel !== m) {
      patch((s) => ({ history: [...s.history.slice(-HISTORY_MAX), g.startModel], future: [] }));
    }
    gestureRef.current = null;
    setGesture(null);
  }, [patch]);

  useEffect(() => {
    const up = () => pointerUp();
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [pointerUp]);

  // ---------- 參數操作 ----------

  /** 方向鍵與浮動工具列：有頂點／邊選取就動它們，否則整塊搬已選區域（同拖拉規則） */
  const nudge = useCallback((dx: number, dy: number) => {
    const m = modelRef.current;
    const whole = !vertexSelRef.current.length && !edgeSelRef.current.length;
    const base = whole ? detachRegions(m, regionSelRef.current) : m;
    const ids = whole
      ? ringVertices(base, regionSelRef.current)
      : vertexSelRef.current.length ? vertexSelRef.current : edgeGroupVertices(edgeSelRef.current);
    if (!ids.length) return;
    const { disp, layers, blocked } = resolveDisp(base, ids, [dx, dy], whole);
    setFollowInfo({ layers, blocked });
    commit(clampToWorld(moveVertices(base, disp)));
  }, [commit, resolveDisp]);

  /** 每條已選邊沿自己的法向位移 d px；共用頂點取平均 */
  const applyNormalOffset = useCallback((d: number) => {
    const m = modelRef.current;
    const acc = new Map<string, XY[]>();
    for (const k of edgeSelRef.current) {
      const e = edgeByKey.get(k);
      if (!e) continue;
      const { n } = edgeFrame(m, e);
      for (const v of [e.a, e.b]) {
        if (!acc.has(v)) acc.set(v, []);
        acc.get(v)!.push([n[0] * d, n[1] * d]);
      }
    }
    if (!acc.size) return;
    const delta = new Map<string, XY>();
    acc.forEach((list, v) => delta.set(v, [list.reduce((s, p) => s + p[0], 0) / list.length, list.reduce((s, p) => s + p[1], 0) / list.length]));
    commit(clampToWorld(moveVertices(m, delta)));
  }, [commit, edgeByKey]);

  const setMaterial = useCallback((material: string, ids?: string[]) => {
    const sel = ids ?? regionSelRef.current;
    if (!sel.length) return;
    const m = modelRef.current;
    commit({ ...m, regions: m.regions.map((r) => (sel.includes(r.id) ? { ...r, material } : r)) });
    setMenu(null);
  }, [commit]);

  const selectByMaterial = useCallback((material: string) => {
    setRegionSel(modelRef.current.regions.filter((r) => r.material === material).map((r) => r.id));
    setEdgeSel([]);
    setVertexSel([]);
  }, []);

  const selectAll = useCallback(() => {
    setRegionSel(modelRef.current.regions.map((r) => r.id));
    setEdgeSel([]);
    setVertexSel([]);
  }, []);

  const bringToFront = useCallback((ids?: string[]) => {
    const sel = new Set(ids ?? regionSelRef.current);
    if (!sel.size) return;
    const m = modelRef.current;
    commit({ ...m, regions: [...m.regions.filter((r) => !sel.has(r.id)), ...m.regions.filter((r) => sel.has(r.id))] });
    setMenu(null);
  }, [commit]);

  const undo = useCallback(() => {
    patch((s) => {
      if (!s.history.length) return {};
      const prev = s.history[s.history.length - 1];
      modelRef.current = prev;
      return { model: prev, history: s.history.slice(0, -1), future: [s.model, ...s.future] };
    });
    setEdgeSel([]);
    setVertexSel([]);
  }, [patch]);

  const redo = useCallback(() => {
    patch((s) => {
      if (!s.future.length) return {};
      const next = s.future[0];
      modelRef.current = next;
      return { model: next, history: [...s.history, s.model], future: s.future.slice(1) };
    });
    setEdgeSel([]);
    setVertexSel([]);
  }, [patch]);

  const reset = useCallback(() => {
    commit(importedRef.current.model);
    clearSel();
    patch(() => ({ baseline: null }));
    setTimeout(() => fit(), 0);
  }, [commit, fit, patch, clearSel]);

  const pinBaseline = useCallback(() => patch(() => ({ baseline: { model: modelRef.current, label: '釘選基準', pinned: true } })), [patch]);
  const clearBaseline = useCallback(() => patch(() => ({ baseline: null })), [patch]);

  /** 右鍵：點到未選的區域就改選它，再開材質選單 */
  const openMenu = useCallback((region: string, x: number, y: number) => {
    if (!regionSelRef.current.includes(region)) {
      setRegionSel([region]);
      setEdgeSel([]);
      setVertexSel([]);
    }
    setMenu({ region, x, y });
  }, []);

  // ---------- 鍵盤 ----------

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (e.key === 'Shift') { setShiftHeld(true); return; }
      if (!mod && (k === 'v' || k === 'e' || k === 'r')) { setHold(k.toUpperCase() as Hold); return; }
      if (mod && k === 'a') { e.preventDefault(); selectAll(); return; }
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); redo(); return; }
      if (e.key === 'Escape') {
        // 先清把手，再清區域
        if (vertexSelRef.current.length || edgeSelRef.current.length) { setEdgeSel([]); setVertexSel([]); }
        else clearSel();
        setMenu(null);
        setPanMode(false);
        return;
      }
      if (k === 'f') fit();
      else if (e.key === '+' || e.key === '=') zoomAt(1.25);
      else if (e.key === '-') zoomAt(0.8);
      else if (k === 'h') setPanMode((p) => !p);
      else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        nudge(e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(false);
      const k = e.key.toLowerCase();
      if (k === 'v' || k === 'e' || k === 'r') setHold(null);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [selectAll, undo, redo, fit, zoomAt, nudge, clearSel]);

  const delta = useMemo(() => {
    if (!gesture || gesture.kind !== 'move' || !gesture.moved) return null;
    const dx = Math.round(gesture.cur.x - gesture.start.x), dy = Math.round(gesture.cur.y - gesture.start.y);
    const normal = gesture.edgeN ? Math.round((dx * gesture.edgeN[0] + dy * gesture.edgeN[1]) * 10) / 10 : null;
    return { dx, dy, normal, cur: gesture.cur };
  }, [gesture]);
  const box = gesture?.kind === 'box'
    ? { x0: Math.min(gesture.start.x, gesture.cur.x), y0: Math.min(gesture.start.y, gesture.cur.y), x1: Math.max(gesture.start.x, gesture.cur.x), y1: Math.max(gesture.start.y, gesture.cur.y) }
    : null;
  /** 顯示把手的區域：已選 + 游標所在 */
  const activeIds = useMemo(() => {
    const out = new Set(regionSel);
    if (hover.kind !== 'none') out.add(hover.kind === 'region' ? hover.id : hover.region);
    return out;
  }, [regionSel, hover]);

  return {
    cut, setCut, imported, loadImage, setNmPerPx, nmPerPx: imported.nmPerPx, materials, model, edges, edgeByKey,
    regionSel, edgeSel, vertexSel, hover, hold, activeIds,
    mirror, setMirror, follow, setFollow, followInfo,
    history, future, baseline, pinBaseline, clearBaseline,
    delta, box, dragging: gesture?.kind === 'move' && gesture.moved,
    view, setView, canvas, setCanvasSize, fit, zoomAt, setZoom, panBy, panMode, setPanMode,
    menu, setMenu, openMenu,
    pointerDown, pointerMove, hitTest,
    nudge, applyNormalOffset, setMaterial, selectByMaterial, selectAll, clearSel, bringToFront,
    undo, redo, reset,
  };
}

export type Editor = ReturnType<typeof useEditor>;
