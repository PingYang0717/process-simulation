import { useMemo, useRef, useState } from 'react';
import { SectionCanvas } from './canvas/SectionCanvas';
import type { Underlay } from './canvas/RasterUnderlay';
import { CUTS, useEditor } from './editor/useEditor';
import { signed } from './editor/view';
import { LeftPanel } from './panels/LeftPanel';
import { ExportPanel, MaterialPanel, ParamsPanel, ScopePanel, SpecPanel, ViewPanel } from './panels/RightPanels';
import { exportRaster } from './raster/exportRaster';
import type { ExportResult } from './raster/exportRaster';
import { VOID_ID } from './raster/importRaster';

const NOUN = { region: '區域', edge: '邊', vertex: '頂點' } as const;

export function App() {
  const ed = useEditor();
  const [nmPerPx, setNmPerPx] = useState(0.5);
  const [underlay, setUnderlay] = useState<Underlay>('original');
  const [alpha, setAlpha] = useState(0.35);
  const [backfill, setBackfill] = useState(VOID_ID);
  const last = useRef<ExportResult | null>(null);
  // 拖拉中沿用上一次的輸出，放開才重算
  const result = useMemo(() => {
    if (ed.dragging && last.current && last.current.data.length === ed.imported.original.length) return last.current;
    const r = exportRaster(ed.imported, ed.model, ed.materials, backfill);
    last.current = r;
    return r;
  }, [ed.imported, ed.model, ed.materials, backfill, ed.dragging]);
  const cut = CUTS.find((c) => c.id === ed.cut)!;

  return (
    <div className="app">
      <LeftPanel ed={ed} nmPerPx={nmPerPx} setNmPerPx={setNmPerPx} />
      <main className="center">
        <div className="ctool">
          <span className="title">
            {cut.name} <small>{cut.desc}｜PNG → 分割 → 編輯 → PNG</small>
          </span>
          <span className="grow" />
          <button onClick={ed.undo} disabled={!ed.history.length}>↶ Undo {ed.history.length || ''}</button>
          <button onClick={ed.redo} disabled={!ed.future.length}>↷ Redo {ed.future.length || ''}</button>
          <button onClick={ed.selectAll}>全選</button>
          <button onClick={ed.clearSelection} disabled={!ed.selected.length}>取消選取</button>
          <button onClick={ed.reset}>重設</button>
        </div>
        <SectionCanvas ed={ed} underlay={underlay} outputData={result.data} overlayAlpha={alpha} />
        <div className="status">
          {ed.delta ? (
            <span className="hot">
              Δx {signed(ed.delta.dx)} nm，Δy {signed(ed.delta.dy)} nm{ed.delta.normal !== null && `，法向 ${signed(ed.delta.normal)} nm`}
            </span>
          ) : (
            <span>
              已選 {ed.selected.length} 個{NOUN[ed.mode]}
              {ed.selected.length ? `（${ed.movingVertices.size} 個頂點）` : ''}
              {ed.mode !== 'region' && ed.scope.length ? `｜範圍 ${ed.scope.length} 區域` : ''}
            </span>
          )}
          <span className="grow" />
          <span className="dim">
            {ed.model.regions.length} 區域／{ed.edges.length} 邊／{Object.keys(ed.model.vertices).length} 頂點｜相異 {result.diffPx.toLocaleString()} px
          </span>
        </div>
      </main>
      <aside className="rightbar">
        <ViewPanel ed={ed} underlay={underlay} setUnderlay={setUnderlay} alpha={alpha} setAlpha={setAlpha} />
        <ScopePanel ed={ed} />
        <MaterialPanel ed={ed} />
        <ExportPanel ed={ed} backfill={backfill} setBackfill={setBackfill} result={result} />
        <SpecPanel ed={ed} />
        <ParamsPanel ed={ed} />
      </aside>
    </div>
  );
}
