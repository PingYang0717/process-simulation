import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyParams, bindingOf, initialDoc, sensitivity, setParam } from '../model/device';
import type { Binding } from '../model/device';
import { bboxOf, centroid, edgeFrame, edgesOf, polyOf, projectOnSegment, r1 } from '../model/geometry';
import { insertBump, insertVertexOnEdge, moveVertices, setMaterial as setMat, setVertexPos } from '../model/ops';
import type { BumpSpec } from '../model/ops';
import type { CutId, Doc, Edge, Mode, Model, ParamKey, XY } from '../model/types';
import { counterparts } from './mirror';
import { fit, zoomAt } from './view';
import type { Size, View } from './view';

const HISTORY_MAX = 50;

export interface Baseline { doc: Doc; label: string; pinned: boolean }
export interface Mods { shift: boolean; ctrl: boolean }

type Gesture =
  | { type: 'move'; startDoc: Doc; start: XY; verts: string[]; normal?: XY; moved: boolean }
  | { type: 'param'; startDoc: Doc; start: XY; binding: Binding; moved: boolean }
  | { type: 'box'; start: XY; additive: boolean };

export interface DragInfo { at: XY; dx: number; dy: number; dn?: number; param?: { key: ParamKey; value: number; delta: number } }

const uniq = (a: string[]) => [...new Set(a)];

export function useEditor() {
  const [doc, setDoc] = useState<Doc>(() => initialDoc());
  const [history, setHistory] = useState<Doc[]>([]);
  const [future, setFuture] = useState<Doc[]>([]);
  const [cut, setCut] = useState<CutId>('x');
  const [mode, setModeState] = useState<Mode>('region');
  const [regionSel, setRegionSel] = useState<string[]>([]);
  const [itemSel, setItemSel] = useState<string[]>([]);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [mirror, setMirror] = useState(true);
  const [panMode, setPanMode] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const [view, setView] = useState<View>({ s: 1, tx: 0, ty: 0 });
  const [size, setSizeState] = useState<Size>({ w: 800, h: 600 });
  const [box, setBox] = useState<{ a: XY; b: XY } | null>(null);
  const [drag, setDrag] = useState<DragInfo | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const boxRef = useRef<{ a: XY; b: XY } | null>(null);
  const updateBox = (b: { a: XY; b: XY } | null) => {
    boxRef.current = b;
    setBox(b);
  };

  const model = doc.cuts[cut];
  const edges = useMemo(() => edgesOf(model), [model]);
  const edgeByKey = useMemo(() => new Map(edges.map((e) => [e.key, e])), [edges]);
  const sens = useMemo(() => sensitivity(cut, doc.params), [cut, doc.params]);
  const bindings = useMemo(() => {
    const m = new Map<string, Binding>();
    for (const e of edges) {
      const b = bindingOf(cut, model, e, sens);
      if (b) m.set(e.key, b);
    }
    return m;
  }, [cut, model, edges, sens]);
  const scope = mode === 'region' ? [] : regionSel;

  // 給 window 事件與 callback 讀最新值
  const S = useRef({ doc, cut, mode, regionSel, itemSel, baseline, mirror, model, edges, edgeByKey, bindings, scope, view, size, history, future });
  S.current = { doc, cut, mode, regionSel, itemSel, baseline, mirror, model, edges, edgeByKey, bindings, scope, view, size, history, future };

  // ---------- 歷史與基準 ----------

  const pushHistory = useCallback((prev: Doc) => {
    setHistory((h) => [...h, prev].slice(-HISTORY_MAX));
    setFuture([]);
  }, []);

  /** 參數與鍵盤操作：沒有基準就先記錄，再推歷史、清 future */
  const commit = useCallback(
    (next: Doc) => {
      const { doc: cur, baseline: bl } = S.current;
      if (next === cur) return;
      if (!bl) setBaseline({ doc: cur, label: '操作前', pinned: false });
      pushHistory(cur);
      setDoc(next);
    },
    [pushHistory],
  );

  const withCut = (d: Doc, c: CutId, m: Model): Doc => ({ ...d, cuts: { ...d.cuts, [c]: m } });

  const commitModel = useCallback((m: Model) => {
    const { doc: d, cut: c } = S.current;
    commit(withCut(d, c, m));
  }, [commit]);

  const cleanSel = (m: Model, items: string[], md: Mode) => {
    if (md === 'vertex') return items.filter((id) => m.vertices[id]);
    if (md === 'edge') {
      const keys = new Set(edgesOf(m).map((e) => e.key));
      return items.filter((k) => keys.has(k));
    }
    return items;
  };

  const undo = useCallback(() => {
    const { history: h, doc: d, cut: c, mode: md } = S.current;
    if (!h.length) return;
    const prev = h[h.length - 1];
    setHistory(h.slice(0, -1));
    setFuture((f) => [d, ...f]);
    setDoc(prev);
    setItemSel((s) => cleanSel(prev.cuts[c], s, md));
  }, []);

  const redo = useCallback(() => {
    const { future: f, doc: d, cut: c, mode: md } = S.current;
    if (!f.length) return;
    const next = f[0];
    setFuture(f.slice(1));
    setHistory((h) => [...h, d].slice(-HISTORY_MAX));
    setDoc(next);
    setItemSel((s) => cleanSel(next.cuts[c], s, md));
  }, []);

  // ---------- 選取 ----------

  const expandMirror = useCallback((items: string[], md: Mode): string[] => {
    const { mirror: on, model: m, scope: sc } = S.current;
    if (!on || md === 'region' || sc.length < 2) return items;
    return uniq([...items, ...items.flatMap((it) => counterparts(m, sc, it, md))]);
  }, []);

  const verticesOf = useCallback((md: Mode, regions: string[], items: string[]): string[] => {
    const { model: m, edgeByKey: ek } = S.current;
    if (md === 'region') return uniq(regions.flatMap((id) => m.regions.find((r) => r.id === id)?.loop ?? []));
    if (md === 'edge') return uniq(items.flatMap((k) => { const e = ek.get(k); return e ? [e.a, e.b] : []; }));
    return items;
  }, []);

  const setMode = useCallback((md: Mode) => {
    setModeState(md);
    setItemSel([]);
  }, []);

  const startBaselineForDrag = () => {
    const { baseline: bl, doc: d } = S.current;
    if (!bl?.pinned) setBaseline({ doc: d, label: '拖拉前', pinned: false });
  };

  const pointerDownItem = useCallback(
    (id: string, nm: XY, mods: Mods) => {
      const { mode: md, regionSel: rs, itemSel: is, doc: d, bindings: bd } = S.current;
      const cur = md === 'region' ? rs : is;
      let next: string[];
      if (mods.ctrl) next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      else if (mods.shift) next = uniq([...cur, id]);
      else next = cur.includes(id) ? cur : [id];
      if (md !== 'region' && !mods.ctrl) next = expandMirror(next, md);
      if (md === 'region') setRegionSel(next);
      else setItemSel(next);
      if (mods.ctrl) return;

      const binding = md === 'edge' ? bd.get(id) : undefined;
      startBaselineForDrag();
      if (binding && !mods.shift) {
        setItemSel([id]);
        gesture.current = { type: 'param', startDoc: d, start: nm, binding, moved: false };
        return;
      }
      let normal: XY | undefined;
      if (md === 'edge') {
        const e = S.current.edgeByKey.get(id);
        if (e) normal = edgeFrame(S.current.model, e).normal;
      }
      gesture.current = { type: 'move', startDoc: d, start: nm, verts: verticesOf(md, next, next), normal, moved: false };
    },
    [expandMirror, verticesOf],
  );

  const pointerDownEmpty = useCallback((nm: XY, mods: Mods) => {
    gesture.current = { type: 'box', start: nm, additive: mods.shift };
    updateBox({ a: nm, b: nm });
  }, []);

  const pointerMove = useCallback((nm: XY) => {
    const g = gesture.current;
    if (!g) return;
    if (g.type === 'box') {
      updateBox({ a: g.start, b: nm });
      return;
    }
    const dx = r1(nm[0] - g.start[0]);
    const dy = r1(nm[1] - g.start[1]);
    if (!g.moved && dx === 0 && dy === 0) return;
    g.moved = true;
    const { cut: c } = S.current;
    if (g.type === 'param') {
      const { param, k, normal } = g.binding;
      const dn = dx * normal[0] + dy * normal[1];
      const p0 = g.startDoc.params[param];
      const params = setParam(g.startDoc.params, param, p0 + dn / k);
      setDoc(applyParams(g.startDoc, params));
      setDrag({ at: nm, dx, dy, dn: r1(dn), param: { key: param, value: params[param], delta: r1(params[param] - p0) } });
      return;
    }
    const delta = new Map<string, XY>(g.verts.map((id) => [id, [dx, dy]]));
    setDoc(withCut(g.startDoc, c, moveVertices(g.startDoc.cuts[c], delta)));
    setDrag({ at: nm, dx, dy, dn: g.normal ? r1(dx * g.normal[0] + dy * g.normal[1]) : undefined });
  }, []);

  const hitBox = (a: XY, b: XY): string[] => {
    const { mode: md, model: m, edges: es, scope: sc } = S.current;
    const r = { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) };
    const inR = ([x, y]: XY) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
    if (r.x1 - r.x0 < 1e-6 && r.y1 - r.y0 < 1e-6) return [];
    if (md === 'region') {
      return m.regions
        .filter((rg) => {
          const pts = polyOf(m, rg);
          const bb = bboxOf(pts);
          return (inR([bb.x0, bb.y0]) && inR([bb.x1, bb.y1])) || inR(centroid(pts));
        })
        .map((rg) => rg.id);
    }
    const inScope = (e: Edge) => !sc.length || e.regions.some((id) => sc.includes(id));
    const v = (id: string): XY => [m.vertices[id].x, m.vertices[id].y];
    if (md === 'edge') return es.filter((e) => inScope(e) && inR(v(e.a)) && inR(v(e.b))).map((e) => e.key);
    const ids = sc.length ? uniq(sc.flatMap((id) => m.regions.find((rg) => rg.id === id)?.loop ?? [])) : Object.keys(m.vertices);
    return ids.filter((id) => inR(v(id)));
  };

  const pointerUp = useCallback(() => {
    const g = gesture.current;
    gesture.current = null;
    setDrag(null);
    if (!g) return;
    if (g.type === 'box') {
      const bx = boxRef.current;
      updateBox(null);
      if (!bx) return;
      const { mode: md, regionSel: rs, itemSel: is } = S.current;
      let hits = hitBox(bx.a, bx.b);
      if (md !== 'region') hits = expandMirror(hits, md);
      const cur = md === 'region' ? rs : is;
      const next = g.additive ? uniq([...cur, ...hits]) : hits;
      if (md === 'region') setRegionSel(next);
      else setItemSel(next);
      return;
    }
    if (g.moved) pushHistory(g.startDoc);
  }, [expandMirror, pushHistory]);

  useEffect(() => {
    const up = () => pointerUp();
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [pointerUp]);

  const selectAll = useCallback(() => {
    const { mode: md, model: m, edges: es, scope: sc } = S.current;
    if (md === 'region') return setRegionSel(m.regions.map((r) => r.id));
    if (md === 'edge') return setItemSel(es.filter((e) => !sc.length || e.regions.some((id) => sc.includes(id))).map((e) => e.key));
    setItemSel(sc.length ? uniq(sc.flatMap((id) => m.regions.find((r) => r.id === id)?.loop ?? [])) : Object.keys(m.vertices));
  }, []);

  const clearSel = useCallback(() => {
    const { itemSel: is } = S.current;
    if (is.length) setItemSel([]);
    else setRegionSel([]);
  }, []);

  // ---------- 參數操作 ----------

  const nudge = useCallback((dx: number, dy: number) => {
    const { mode: md, regionSel: rs, itemSel: is, model: m } = S.current;
    const verts = verticesOf(md, rs, is);
    if (!verts.length) return;
    commitModel(moveVertices(m, new Map(verts.map((id) => [id, [dx, dy] as XY]))));
  }, [commitModel, verticesOf]);

  const applyNormalOffset = useCallback((d: number) => {
    const { itemSel: is, model: m, edgeByKey: ek, scope: sc } = S.current;
    const delta = new Map<string, XY>();
    for (const k of is) {
      const e = ek.get(k);
      if (!e) continue;
      const away = e.regions.find((id) => sc.includes(id));
      const { normal } = edgeFrame(m, e, away);
      for (const id of [e.a, e.b]) delta.set(id, [normal[0] * d, normal[1] * d]);
    }
    commitModel(moveVertices(m, delta));
  }, [commitModel]);

  const setVertex = useCallback((id: string, xy: XY) => {
    commitModel(setVertexPos(S.current.model, id, xy));
  }, [commitModel]);

  const addBump = useCallback((key: string, spec: BumpSpec) => {
    const { model: m, edgeByKey: ek } = S.current;
    const e = ek.get(key);
    if (!e) return;
    commitModel(insertBump(m, e, spec));
    setItemSel([]);
  }, [commitModel]);

  const splitEdge = useCallback((key: string, at: XY | number) => {
    const { model: m, edgeByKey: ek } = S.current;
    const e = ek.get(key);
    if (!e) return;
    const a = m.vertices[e.a], b = m.vertices[e.b];
    const t = typeof at === 'number' ? at : projectOnSegment(at, [a.x, a.y], [b.x, b.y]).t;
    if (t <= 0.001 || t >= 0.999) return;
    const r = insertVertexOnEdge(m, e, [r1(a.x + (b.x - a.x) * t), r1(a.y + (b.y - a.y) * t)]);
    commitModel(r.model);
    if (S.current.mode === 'vertex') setItemSel([r.id]);
    else setItemSel([]);
  }, [commitModel]);

  /** 色票：有選區域→套用；沒選→選取所有同材質區域 */
  const pickMaterial = useCallback((material: string) => {
    const { regionSel: rs, model: m } = S.current;
    if (rs.length) commitModel(setMat(m, rs, material));
    else setRegionSel(m.regions.filter((r) => r.material === material).map((r) => r.id));
  }, [commitModel]);

  const setParamValue = useCallback((key: ParamKey, value: number) => {
    const { doc: d } = S.current;
    const p = setParam(d.params, key, value);
    if (p[key] === d.params[key]) return;
    commit(applyParams(d, p));
  }, [commit]);

  const reset = useCallback(() => {
    commit(initialDoc());
    setBaseline(null);
    setRegionSel([]);
    setItemSel([]);
  }, [commit]);

  const switchCut = useCallback((c: CutId) => {
    setCut(c);
    setRegionSel([]);
    setItemSel([]);
  }, []);

  const pinBaseline = useCallback(() => setBaseline({ doc: S.current.doc, label: '釘選', pinned: true }), []);
  const clearBaseline = useCallback(() => setBaseline(null), []);

  // ---------- 視圖 ----------

  const fitView = useCallback(() => {
    const { model: m, size: sz } = S.current;
    setView(fit(m.world, sz));
  }, []);

  const setSize = useCallback((sz: Size) => {
    const prev = S.current.size;
    S.current.size = sz;
    setSizeState(sz);
    if (Math.abs(prev.w - sz.w) > 2 || Math.abs(prev.h - sz.h) > 2) setView(fit(S.current.model.world, sz));
  }, []);

  const zoomBy = useCallback((f: number, at?: XY) => {
    const { view: v, size: sz } = S.current;
    setView(zoomAt(v, v.s * f, at ?? [sz.w / 2, sz.h / 2]));
  }, []);

  const zoomTo = useCallback((s: number) => {
    const { view: v, size: sz } = S.current;
    setView(zoomAt(v, s, [sz.w / 2, sz.h / 2]));
  }, []);

  useEffect(() => {
    setView(fit(doc.cuts[cut].world, S.current.size));
    // 只在切換剖面時重新 fit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cut]);

  // ---------- 鍵盤 ----------

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key;
      if (mod && k.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
      if (mod && k.toLowerCase() === 'y') { e.preventDefault(); return redo(); }
      if (mod && k.toLowerCase() === 'a') { e.preventDefault(); return selectAll(); }
      if (mod) return;
      if (k === '1') return setMode('region');
      if (k === '2') return setMode('edge');
      if (k === '3') return setMode('vertex');
      if (k === 'Escape') return clearSel();
      if (k === ' ') { e.preventDefault(); return setSpaceDown(true); }
      if (k === '+' || k === '=') return zoomBy(1.25);
      if (k === '-' || k === '_') return zoomBy(0.8);
      if (k === 'f' || k === 'F') return fitView();
      const step = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
      const dir: Record<string, XY> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (dir[k]) { e.preventDefault(); nudge(...dir[k]); }
    };
    const upKey = (e: KeyboardEvent) => { if (e.key === ' ') setSpaceDown(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', upKey);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', upKey);
    };
  }, [undo, redo, selectAll, setMode, clearSel, zoomBy, fitView, nudge]);

  return {
    doc, model, cut, mode, regionSel, itemSel, scope, edges, edgeByKey, bindings, baseline, mirror, panMode, spaceDown,
    view, size, box, drag, history, future,
    setMode, switchCut, setMirror, setPanMode, setView, setSize, fitView, zoomBy, zoomTo,
    pointerDownItem, pointerDownEmpty, pointerMove, pointerUp, selectAll, clearSel,
    undo, redo, nudge, applyNormalOffset, setVertex, addBump, splitEdge, pickMaterial, setParamValue, reset,
    pinBaseline, clearBaseline,
  };
}

export type Editor = ReturnType<typeof useEditor>;
