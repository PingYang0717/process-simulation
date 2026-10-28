import { useMemo, useRef, useState } from 'react';
import { SectionCanvas } from './canvas/SectionCanvas';
import type { Underlay } from './canvas/RasterUnderlay';
import { CUTS, useEditor } from './editor/useEditor';
import { signed } from './editor/view';
import { LeftPanel } from './panels/LeftPanel';
import { ExportPanel, MaterialPanel, SpecPanel, ViewPanel } from './panels/RightPanels';
import { exportRaster } from './raster/exportRaster';
import type { ExportResult } from './raster/exportRaster';
import { VOID_ID } from './raster/importRaster';

const HOLD = { V: '節點（顯示全部的點）', E: '邊', R: '區域' } as const;

export function App() {
  const ed = useEditor();
  const [underlay, setUnderlay] = useState<Underlay>('output');
  const [alpha, setAlpha] = useState(0.3);
  const [showDiff, setShowDiff] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [backfill, setBackfill] = useState(VOID_ID);
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const last = useRef<ExportResult | null>(null);
  // 拖拉中即時重算（約 20 ms / 640×360）；超過 1M 像素的大圖才沿用上一次，放開再算
  const big = ed.imported.width * ed.imported.height > 1_000_000;
  const result = useMemo(() => {
    if (big && ed.dragging && last.current && last.current.data.length === ed.imported.original.length) return last.current;
    const r = exportRaster(ed.imported, ed.model, ed.materials, backfill);
    last.current = r;
    return r;
  }, [ed.imported, ed.model, ed.materials, backfill, big && ed.dragging]);
  const cut = CUTS.find((c) => c.id === ed.cut)!;
  const h = ed.hover;
  const labelOf = (id: string) => ed.model.regions.find((r) => r.id === id)?.label;
  const pointing = h.kind === 'vertex' ? `${labelOf(h.region)} 的節點` : h.kind === 'edge' ? `${labelOf(h.region)} 的邊` : h.kind === 'region' ? labelOf(h.id) : '';

  return (
    <div className={'app' + (showLeft ? '' : ' no-left') + (showRight ? '' : ' no-right')}>
      <LeftPanel ed={ed} />
      <main className="center">
        <div className="ctool">
          <button className="side" onClick={() => setShowLeft(!showLeft)} title={showLeft ? '收合左欄' : '展開左欄'}>{showLeft ? '◀' : '▶'} 圖片與說明</button>
          <span className="title">
            {cut.name} <small>{ed.imported.source ?? '內建範例'}</small>
          </span>
          <span className="grow" />
          <button onClick={ed.undo} disabled={!ed.history.length}>↶ Undo {ed.history.length || ''}</button>
          <button onClick={ed.redo} disabled={!ed.future.length}>↷ Redo {ed.future.length || ''}</button>
          <button onClick={ed.selectAll}>全選</button>
          <button onClick={ed.clearSel} disabled={!ed.regionSel.length}>取消選取</button>
          <button onClick={ed.reset}>重設</button>
          <button className="side" onClick={() => setShowRight(!showRight)} title={showRight ? '收合右欄' : '展開右欄'}>顯示與輸出 {showRight ? '▶' : '◀'}</button>
        </div>
        <SectionCanvas ed={ed} underlay={underlay} result={result} overlayAlpha={alpha} showDiff={showDiff} showLabels={showLabels} />
        <div className="status">
          {ed.delta ? (
            <span className="hot">
              Δx {signed(ed.delta.dx)} px，Δy {signed(ed.delta.dy)} px
              {ed.delta.normal !== null && `，往外 ${signed(ed.delta.normal, 1)} px`}
              {ed.followInfo.layers ? `｜外面 ${ed.followInfo.layers} 層一起推` : ''}
              {ed.followInfo.blocked ? '｜已停住（再推會穿過旁邊的層）' : ''}
            </span>
          ) : (
            <span>
              {pointing ? `${pointing}　` : ''}已選 {ed.regionSel.length} 個區域
              {ed.edgeSel.length ? `、${ed.edgeSel.length} 段邊` : ''}
              {ed.vertexSel.length ? `、${ed.vertexSel.length} 個節點` : ''}
              {ed.hold ? `｜只抓${HOLD[ed.hold]}` : ''}
            </span>
          )}
          <span className="grow" />
          <span className="dim">
            {ed.model.regions.length} 個區域｜改動 {result.diffPx.toLocaleString()} 像素
          </span>
        </div>
      </main>
      <aside className="rightbar">
        <ViewPanel ed={ed} d={{ underlay, setUnderlay, alpha, setAlpha, showDiff, setShowDiff, showLabels, setShowLabels }} />
        <MaterialPanel ed={ed} />
        <ExportPanel ed={ed} backfill={backfill} setBackfill={setBackfill} result={result} />
        <SpecPanel ed={ed} />
      </aside>
    </div>
  );
}
