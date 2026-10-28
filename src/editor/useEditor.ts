import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { bboxOf, edgeFrame, edgesOf, polyOf, r1 } from '../model/geometry';
import { clampToWorld, detachRegions, insertBump, insertVertexOnEdge, moveVertices } from '../model/ops';
import type { BumpSpec } from '../model/ops';
import type { CutId, CutState, Edge, Imported, Mode, Model, XY } from '../model/types';
import { demoX, demoY, demoZ } from '../raster/demo';
import { importRaster } from '../raster/importRaster';
import type { RasterImage } from '../model/types';
import { counterparts } from './mirror';
import { MAX_S, MIN_S } from './view';
import type { Size, View } from './view';

const HISTORY_MAX = 50;

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

export interface Mods { shift: boolean; ctrl: boolean }
type Pt = { x: number; y: number };
type Gesture =
  | { kind: 'move'; startModel: Model; start: Pt; cur: Pt; ids: string[]; moved: boolean; edgeN?: XY; base?: Model }
  | { kind: 'box'; start: Pt; cur: Pt; additive: boolean };

/** 選取項目牽動的頂點：區域 → 環（含孔），邊 → 兩端點，頂點 → 自己 */
function verticesOf(model: Model, mode: Mode, ids: string[]): Set<string> {
  const out = new Set<string>();
  const byKey = mode === 'edge' ? new Map(edgesOf(model).map((e) => [e.key, e])) : null;
  for (const id of ids) {
    if (mode === 'vertex') out.add(id);
    else if (mode === 'edge') {
      const e = byKey!.get(id);
      if (e) { out.add(e.a); out.add(e.b); }
    } else {
      const r = model.regions.find((x) => x.id === id);
      r?.loop.forEach((v) => out.add(v));
      r?.holes?.forEach((h) => h.forEach((v) => out.add(v)));
    }
  }
  return out;
}

export function useEditor() {
  const [cut, setCutState] = useState<CutId>('x');
  const [cuts, setCuts] = useState(initialCuts);
  const cutRef = useRef(cut);
  cutRef.current = cut;
  /** 只改目前方向槽 */
  const patch = useCallback((fn: (s: CutState) => Partial<CutState>) => {
    setCuts((all) => ({ ...all, [cutRef.current]: { ...all[cutRef.current], ...fn(all[cutRef.current]) } }));
  }, []);

  const state = cuts[cut];
  const { imported, model, history, future, baseline } = state;
  const [mode, setModeState] = useState<Mode>('region');
  const [regionSel, setRegionSel] = useState<string[]>([]); // 也是邊／頂點模式的編輯範圍
  const [itemSel, setItemSel] = useState<string[]>([]);
  const [mirror, setMirror] = useState(true);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [multiMode, setMultiMode] = useState(false);
  const [panMode, setPanMode] = useState(false);
  const [view, setView] = useState<View>({ s: 3, tx: 0, ty: 300 });
  const [canvas, setCanvas] = useState<Size>({ w: 600, h: 500 });
  const materials = imported.materials;
  const selected = mode === 'region' ? regionSel : itemSel;
  const setSelected = useCallback((v: string[] | ((cur: string[]) => string[])) => {
    if (modeRef.current === 'region') setRegionSel(v);
    else setItemSel(v);
  }, []);
  const edges = useMemo(() => edgesOf(model), [model]);
  const edgeByKey = useMemo(() => new Map<string, Edge>(edges.map((e) => [e.key, e])), [edges]);

  // 給 window 事件與 callback 讀最新值
  const modelRef = useRef(model); modelRef.current = model;
  const gestureRef = useRef(gesture); gestureRef.current = gesture;
  const modeRef = useRef(mode); modeRef.current = mode;
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const scopeRef = useRef(regionSel); scopeRef.current = regionSel;
  const mirrorRef = useRef(mirror); mirrorRef.current = mirror;
  const baselineRef = useRef(baseline); baselineRef.current = baseline;
  const viewRef = useRef(view); viewRef.current = view;
  const canvasRef = useRef(canvas); canvasRef.current = canvas;

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

  const fit = useCallback((w = canvasRef.current.w, h = canvasRef.current.h) => {
    const wd = modelRef.current.world;
    const ww = wd.x1 - wd.x0, wh = wd.yBot - wd.yTop;
    const s = Math.min(w / ww, h / wh) * 0.92;
    setView({ s, tx: (w - ww * s) / 2 - wd.x0 * s, ty: (h - wh * s) / 2 - wd.yTop * s });
  }, []);

  const loadImage = useCallback((imp: Imported) => {
    modelRef.current = imp.model;
    patch(() => ({ imported: imp, model: imp.model, history: [], future: [], baseline: null }));
    setRegionSel([]);
    setItemSel([]);
    setTimeout(() => fit(), 0);
  }, [patch, fit]);

  const pinBaseline = useCallback(() => patch(() => ({ baseline: { model: modelRef.current, label: '釘選基準', pinned: true } })), [patch]);
  const clearBaseline = useCallback(() => patch(() => ({ baseline: null })), [patch]);

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

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    modeRef.current = m;
    setItemSel([]);
  }, []);

  const expandMirror = useCallback((items: string[]) => {
    if (!mirrorRef.current || modeRef.current === 'region') return items;
    const out = new Set(items);
    for (const it of items) counterparts(modelRef.current, modeRef.current, it, scopeRef.current).forEach((c) => out.add(c));
    return [...out];
  }, []);

  // ---------- 指標 ----------

  const pointerDownItem = useCallback((id: string, at: Pt, mods: Mods) => {
    const cur = selectedRef.current;
    const toggle = mods.ctrl || multiMode;
    let next: string[];
    if (toggle) next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    else if (mods.shift) next = cur.includes(id) ? cur : [...cur, id];
    else next = cur.includes(id) ? cur : [id];
    next = expandMirror(next);
    setSelected(next);
    if (toggle || !next.includes(id)) return;
    if (!baselineRef.current?.pinned) patch(() => ({ baseline: { model: modelRef.current, label: '拖拉前', pinned: false } }));
    let edgeN: XY | undefined;
    if (modeRef.current === 'edge' && next.length === 1) {
      const e = edgeByKey.get(next[0]);
      if (e) edgeN = edgeFrame(modelRef.current, e).n;
    }
    const g: Gesture = { kind: 'move', startModel: modelRef.current, start: at, cur: at, ids: next, moved: false, edgeN };
    gestureRef.current = g;
    setGesture(g);
  }, [multiMode, edgeByKey, expandMirror, setSelected, patch]);

  const pointerDownBackground = useCallback((at: Pt, mods: Mods) => {
    const additive = mods.shift || mods.ctrl || multiMode;
    if (!additive) setSelected([]);
    if (modeRef.current === 'region' && !additive) setItemSel([]);
    const g: Gesture = { kind: 'box', start: at, cur: at, additive };
    gestureRef.current = g;
    setGesture(g);
  }, [multiMode, setSelected]);

  const pointerMove = useCallback((at: Pt) => {
    const g = gestureRef.current;
    if (!g) return;
    if (g.kind === 'box') {
      const next = { ...g, cur: at };
      gestureRef.current = next;
      setGesture(next);
      return;
    }
    const dx = r1(at.x - g.start.x), dy = r1(at.y - g.start.y);
    // 區域整塊拖：第一次移動才分離共用頂點，只點不拖不改模型
    const base = g.base ?? (modeRef.current === 'region' ? detachRegions(g.startModel, g.ids) : g.startModel);
    const delta = new Map<string, XY>();
    verticesOf(base, modeRef.current, g.ids).forEach((v) => delta.set(v, [dx, dy]));
    const next = { ...g, base, cur: at, moved: true };
    gestureRef.current = next;
    setGesture(next);
    setLive(clampToWorld(moveVertices(base, delta)));
  }, [setLive]);

  const pointerUp = useCallback(() => {
    const g = gestureRef.current;
    if (!g) return;
    const m = modelRef.current;
    if (g.kind === 'box') {
      const x0 = Math.min(g.start.x, g.cur.x), x1 = Math.max(g.start.x, g.cur.x);
      const y0 = Math.min(g.start.y, g.cur.y), y1 = Math.max(g.start.y, g.cur.y);
      const inBox = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
      if ((x1 - x0) * viewRef.current.s > 3 || (y1 - y0) * viewRef.current.s > 3) {
        const md = modeRef.current;
        const scope = new Set(scopeRef.current);
        const scopeVerts = new Set<string>();
        if (scope.size) m.regions.filter((r) => scope.has(r.id)).forEach((r) => r.loop.forEach((v) => scopeVerts.add(v)));
        let hits: string[];
        if (md === 'vertex') {
          hits = Object.values(m.vertices).filter((v) => inBox(v.x, v.y) && (!scope.size || scopeVerts.has(v.id))).map((v) => v.id);
        } else if (md === 'edge') {
          hits = edgesOf(m)
            .filter((e) => (!scope.size || e.regions.some((r) => scope.has(r))) && inBox(m.vertices[e.a].x, m.vertices[e.a].y) && inBox(m.vertices[e.b].x, m.vertices[e.b].y))
            .map((e) => e.key);
        } else {
          hits = m.regions
            .filter((r) => {
              const b = bboxOf(polyOf(m, r));
              return b.x1 >= x0 && b.x0 <= x1 && b.y1 >= y0 && b.y0 <= y1;
            })
            .map((r) => r.id);
        }
        hits = expandMirror(hits);
        setSelected((cur) => (g.additive ? [...new Set([...cur, ...hits])] : hits));
      }
    } else if (g.moved && g.startModel !== m) {
      patch((s) => ({ history: [...s.history.slice(-HISTORY_MAX), g.startModel], future: [] }));
    }
    gestureRef.current = null;
    setGesture(null);
  }, [expandMirror, setSelected, patch]);

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

  const nudge = useCallback((dx: number, dy: number) => {
    const base = modeRef.current === 'region' ? detachRegions(modelRef.current, selectedRef.current) : modelRef.current;
    const verts = verticesOf(base, modeRef.current, selectedRef.current);
    if (!verts.size) return;
    const delta = new Map<string, XY>();
    verts.forEach((v) => delta.set(v, [dx, dy]));
    commit(clampToWorld(moveVertices(base, delta)));
  }, [commit]);

  /** 每條已選邊沿自己的法向位移；共用頂點取平均 */
  const applyNormalOffset = useCallback((d: number) => {
    const m = modelRef.current;
    const byKey = new Map(edgesOf(m).map((e) => [e.key, e]));
    const acc = new Map<string, XY[]>();
    for (const k of selectedRef.current) {
      const e = byKey.get(k);
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
  }, [commit]);

  const setVertexPos = useCallback((id: string, x: number, y: number) => {
    const v = modelRef.current.vertices[id];
    if (v) commit(clampToWorld(moveVertices(modelRef.current, new Map([[id, [x - v.x, y - v.y] as XY]]))));
  }, [commit]);

  const addBump = useCallback((key: string, spec: BumpSpec) => {
    const e = edgesOf(modelRef.current).find((x) => x.key === key);
    if (!e) return;
    commit(insertBump(modelRef.current, e, spec));
    setItemSel([]);
  }, [commit]);

  const splitEdgeAt = useCallback((key: string, at: Pt) => {
    const e = edgesOf(modelRef.current).find((x) => x.key === key);
    if (!e) return;
    commit(insertVertexOnEdge(modelRef.current, e, [at.x, at.y]));
    setItemSel([]);
  }, [commit]);

  const setMaterial = useCallback((material: string) => {
    if (modeRef.current !== 'region' || !selectedRef.current.length) return;
    const m = modelRef.current;
    commit({ ...m, regions: m.regions.map((r) => (selectedRef.current.includes(r.id) ? { ...r, material } : r)) });
  }, [commit]);

  const selectByMaterial = useCallback((material: string) => {
    setModeState('region');
    modeRef.current = 'region';
    setItemSel([]);
    setRegionSel(modelRef.current.regions.filter((r) => r.material === material).map((r) => r.id));
  }, []);

  const selectAll = useCallback(() => {
    const m = modelRef.current;
    const scope = new Set(scopeRef.current);
    if (modeRef.current === 'region') setRegionSel(m.regions.map((r) => r.id));
    else if (modeRef.current === 'edge') setItemSel(edgesOf(m).filter((e) => !scope.size || e.regions.some((r) => scope.has(r))).map((e) => e.key));
    else {
      const vs = new Set<string>();
      m.regions.filter((r) => !scope.size || scope.has(r.id)).forEach((r) => r.loop.forEach((v) => vs.add(v)));
      setItemSel([...vs]);
    }
  }, []);

  /** Esc：先清邊／頂點，再清區域 */
  const clearSelection = useCallback(() => {
    if (modeRef.current !== 'region' && selectedRef.current.length) setItemSel([]);
    else { setRegionSel([]); setItemSel([]); }
  }, []);

  const undo = useCallback(() => {
    patch((s) => {
      if (!s.history.length) return {};
      const prev = s.history[s.history.length - 1];
      modelRef.current = prev;
      return { model: prev, history: s.history.slice(0, -1), future: [s.model, ...s.future] };
    });
    setItemSel([]);
  }, [patch]);

  const redo = useCallback(() => {
    patch((s) => {
      if (!s.future.length) return {};
      const next = s.future[0];
      modelRef.current = next;
      return { model: next, history: [...s.history, s.model], future: s.future.slice(1) };
    });
    setItemSel([]);
  }, [patch]);

  const setCut = useCallback((c: CutId) => {
    setCutState(c);
    cutRef.current = c;
    setRegionSel([]);
    setItemSel([]);
    setTimeout(() => fit(), 0);
  }, [fit]);

  const reset = useCallback(() => {
    commit(imported.model);
    setRegionSel([]);
    setItemSel([]);
    patch(() => ({ baseline: null }));
    setTimeout(() => fit(), 0);
  }, [commit, fit, imported, patch]);

  const bringToFront = useCallback(() => {
    if (modeRef.current !== 'region' || !selectedRef.current.length) return;
    const sel = new Set(selectedRef.current);
    const m = modelRef.current;
    commit({ ...m, regions: [...m.regions.filter((r) => !sel.has(r.id)), ...m.regions.filter((r) => sel.has(r.id))] });
  }, [commit]);

  // ---------- 鍵盤 ----------

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'a') { e.preventDefault(); selectAll(); return; }
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); redo(); return; }
      if (e.key === 'Escape') { clearSelection(); setPanMode(false); return; }
      if (e.key === '1') setMode('region');
      else if (e.key === '2') setMode('edge');
      else if (e.key === '3') setMode('vertex');
      else if (k === 'f') fit();
      else if (e.key === '+' || e.key === '=') zoomAt(1.25);
      else if (e.key === '-') zoomAt(0.8);
      else if (k === 'h') setPanMode((p) => !p);
      else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        nudge(dx, dy);
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [selectAll, undo, redo, setMode, fit, zoomAt, nudge, clearSelection]);

  const delta = useMemo(() => {
    if (!gesture || gesture.kind !== 'move' || !gesture.moved) return null;
    const dx = r1(gesture.cur.x - gesture.start.x), dy = r1(gesture.cur.y - gesture.start.y);
    const normal = gesture.edgeN ? r1(dx * gesture.edgeN[0] + dy * gesture.edgeN[1]) : null;
    return { dx, dy, dist: r1(Math.hypot(dx, dy)), normal, cur: gesture.cur };
  }, [gesture]);
  const box = gesture?.kind === 'box'
    ? { x0: Math.min(gesture.start.x, gesture.cur.x), y0: Math.min(gesture.start.y, gesture.cur.y), x1: Math.max(gesture.start.x, gesture.cur.x), y1: Math.max(gesture.start.y, gesture.cur.y) }
    : null;
  const movingVertices = useMemo(() => verticesOf(model, mode, selected), [model, mode, selected]);

  return {
    cut, setCut, imported, loadImage, materials, model, edges, edgeByKey,
    mode, setMode, selected, scope: regionSel, mirror, setMirror, bringToFront,
    baseline, pinBaseline, clearBaseline, multiMode, setMultiMode, panMode, setPanMode,
    history, future, delta, dragging: gesture?.kind === 'move' && gesture.moved, box, movingVertices,
    view, setView, canvas, setCanvasSize, fit, zoomAt, setZoom, panBy,
    pointerDownItem, pointerDownBackground, pointerMove,
    nudge, applyNormalOffset, setVertexPos, addBump, splitEdgeAt, setMaterial, selectByMaterial,
    selectAll, clearSelection, undo, redo, reset,
  };
}

export type Editor = ReturnType<typeof useEditor>;
