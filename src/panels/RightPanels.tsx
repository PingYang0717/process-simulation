import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '../editor/useEditor';
import { MAX_S, MIN_S, niceStep } from '../editor/view';
import { bboxOf, edgeLength, polyOf } from '../model/geometry';
import type { Model, Region } from '../model/types';
import type { Underlay } from '../canvas/RasterUnderlay';
import { materialOf } from '../raster/exportRaster';
import type { ExportResult } from '../raster/exportRaster';
import { DeltaCell, NumField, Section } from './ui';

export function ViewPanel({ ed, underlay, setUnderlay, alpha, setAlpha }: { ed: Editor; underlay: Underlay; setUnderlay: (u: Underlay) => void; alpha: number; setAlpha: (a: number) => void }) {
  const pct = Math.round((ed.view.s / ed.imported.nmPerPx) * 100);
  return (
    <Section title="顯示與縮放">
      <div className="row">
        <div className="seg" style={{ flex: 1 }}>
          {([['original', '底圖：原圖'], ['output', '底圖：輸出'], ['none', '無']] as [Underlay, string][]).map(([k, label]) => (
            <button key={k} className={underlay === k ? 'on' : ''} onClick={() => setUnderlay(k)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="row">
        <label className="num" style={{ width: '100%' }}>
          <span>向量層不透明度 {Math.round(alpha * 100)}%</span>
          <input type="range" min={0} max={1} step={0.05} value={alpha} onChange={(e) => setAlpha(+e.target.value)} />
        </label>
      </div>
      <div className="row">
        <button onClick={() => ed.zoomAt(0.8)}>−</button>
        <input type="range" min={Math.log(MIN_S)} max={Math.log(MAX_S)} step={0.01} value={Math.log(ed.view.s)} onChange={(e) => ed.setZoom(Math.exp(+e.target.value))} style={{ flex: 1 }} />
        <button onClick={() => ed.zoomAt(1.25)}>+</button>
      </div>
      <div className="row">
        <span className="mono">{pct}%　{(ed.view.s / ed.imported.nmPerPx).toFixed(2)} 螢幕px／影像px</span>
        <button onClick={() => ed.fit()}>適合視窗</button>
        <button onClick={() => ed.setZoom(ed.imported.nmPerPx)}>100%</button>
      </div>
      <div className="row">
        <button className={ed.panMode ? 'on' : ''} onClick={() => ed.setPanMode(!ed.panMode)}>✋ 平移 (H)</button>
        <button className={ed.multiMode ? 'on' : ''} onClick={() => ed.setMultiMode(!ed.multiMode)}>多選模式</button>
      </div>
    </Section>
  );
}

export function ScopePanel({ ed }: { ed: Editor }) {
  const regions = ed.model.regions.filter((r) => ed.scope.includes(r.id));
  return (
    <Section title="編輯範圍">
      <div className="small">{regions.length ? regions.map((r) => r.label).join('、') : '未選區域：邊／頂點模式會顯示全部'}</div>
      <div className="row">
        <label className="chk">
          <input type="checkbox" checked={ed.mirror} onChange={(e) => ed.setMirror(e.target.checked)} /> 多區域同步編輯對應的邊／頂點
        </label>
      </div>
      <div className="row">
        <button onClick={ed.bringToFront} disabled={ed.mode !== 'region' || !ed.selected.length}>選取區域移到最上層</button>
      </div>
    </Section>
  );
}

export function MaterialPanel({ ed }: { ed: Editor }) {
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    ed.model.regions.forEach((r) => (c[r.material] = (c[r.material] ?? 0) + 1));
    return c;
  }, [ed.model]);
  const applying = ed.mode === 'region' && ed.selected.length > 0;
  const current = new Set(ed.model.regions.filter((r) => applying && ed.selected.includes(r.id)).map((r) => r.material));
  return (
    <Section title="材質" right={<small className="dim">{applying ? `點一下＝套用到 ${ed.selected.length} 個已選區域` : '點一下＝選取所有同材質區域'}</small>}>
      <div className="mats">
        {ed.materials.map((m) => (
          <button
            key={m.id}
            className={'mat' + (current.has(m.id) ? ' cur' : '') + (applying ? ' apply' : '') + (m.isVoid ? ' void' : '')}
            onClick={() => (applying ? ed.setMaterial(m.id) : ed.selectByMaterial(m.id))}
            title={applying ? `套用 ${m.name}` : `選取所有 ${m.name}`}
          >
            <span className="sw" style={{ background: m.fill }} />
            <span className="nm">{m.name}</span>
            <span className="ct">{counts[m.id] ?? ''}</span>
          </button>
        ))}
      </div>
      <small className="dim">材質由影像調色盤自動產生（顏色即輸出顏色）；VOID 是額外加入的，輸出時畫成黑色。</small>
    </Section>
  );
}

export function ExportPanel({ ed, backfill, setBackfill, result }: { ed: Editor; backfill: string; setBackfill: (id: string) => void; result: ExportResult }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { width: W, height: H } = ed.imported;
  const [msg, setMsg] = useState('');
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = W;
    c.height = H;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(result.data), W, H), 0, 0);
  }, [result, W, H]);
  const download = () => {
    ref.current?.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tcad-edited.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setMsg('已送出下載。');
    }, 'image/png');
  };
  const pct = ((result.diffPx / (W * H)) * 100).toFixed(2);
  return (
    <Section title="輸出 PNG" right={<small className="dim">{W} × {H} px，與輸入相同</small>}>
      <canvas ref={ref} className="thumb" style={{ width: '100%', imageRendering: 'pixelated' }} />
      <div className="small mono">與原圖相異像素：{result.diffPx.toLocaleString()}（{pct}%）　重畫區域 {result.changed.length}</div>
      <div className="row">
        <label className="num">
          <span>回填材質（搬走後空出的地方）</span>
          <select value={backfill} onChange={(e) => setBackfill(e.target.value)}>
            {ed.materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <button className="primary" onClick={download}>下載 PNG</button>
      </div>
      {msg && <small className="dim">{msg}</small>}
      <small className="dim">沒動到的像素原樣保留；有變動的區域先用回填材質清掉原像素，再以像素中心掃描線填新形狀（無反鋸齒，顏色只會是調色盤內的顏色）。</small>
    </Section>
  );
}

const boxOf = (m: Model, r: Region) => {
  const found = m.regions.find((x) => x.id === r.id);
  if (!found) return undefined;
  const b = bboxOf(polyOf(m, found));
  return { w: b.x1 - b.x0, h: b.y1 - b.y0, x: b.x0, y: b.y0 };
};

export function SpecPanel({ ed }: { ed: Editor }) {
  const { view, model, baseline } = ed;
  const nmPerPx = ed.imported.nmPerPx;
  const grid = niceStep(view.s);
  const bar = niceStep(view.s, 120);
  const barPx = bar * view.s;
  const inScope = model.regions.filter((r) => ed.scope.includes(r.id));
  const rows = inScope.length ? inScope : model.regions;
  const before = baseline?.model;
  const changedCount = before
    ? rows.filter((r) => {
        const a = boxOf(model, r), b = boxOf(before, r);
        return a && b && (a.w !== b.w || a.h !== b.h || a.x !== b.x || a.y !== b.y);
      }).length
    : 0;
  const scopeBox = inScope.length > 1 ? bboxOf(inScope.flatMap((r) => polyOf(model, r))) : null;
  const scopeBoxBefore = scopeBox && before
    ? bboxOf(inScope.flatMap((r) => {
        const o = before.regions.find((x) => x.id === r.id);
        return o ? polyOf(before, o) : [];
      }))
    : null;
  const selEdges = ed.mode === 'edge' ? ed.selected.map((k) => ed.edgeByKey.get(k)).filter((e) => !!e) : [];
  const bw = Math.min(barPx, 240);
  return (
    <Section title="Scale / Spec Preview">
      <svg width="100%" height={44} viewBox="0 0 260 44" className="scalebar">
        <line x1={10} y1={26} x2={10 + bw} y2={26} stroke="#111" strokeWidth={2} />
        <line x1={10} y1={20} x2={10} y2={32} stroke="#111" strokeWidth={2} />
        <line x1={10 + bw} y1={20} x2={10 + bw} y2={32} stroke="#111" strokeWidth={2} />
        <text x={10 + bw / 2} y={14} fontSize={11} textAnchor="middle">{bar} nm = {Math.round(bar / nmPerPx)} 影像 px</text>
        <text x={10} y={42} fontSize={9.5} fill="#666">格線 {grid} nm　1 px = {nmPerPx} nm</text>
      </svg>
      <div className="row base">
        <span className="dim">
          {before ? `基準：${baseline!.label}${baseline!.pinned ? '（釘選）' : ''}，${changedCount} 個區域有變動` : '基準：尚無（開始拖拉或套用參數時自動記錄）'}
        </span>
        <button onClick={ed.pinBaseline}>釘選現況為基準</button>
        {before && <button onClick={ed.clearBaseline}>清除</button>}
      </div>
      {selEdges.length > 0 && (
        <div className="specwrap">
          <table className="spec">
            <thead><tr><th>已選邊 {selEdges.length}</th><th>長度 nm</th><th>相鄰</th></tr></thead>
            <tbody>
              {selEdges.map((e) => (
                <tr key={e.key}>
                  <td className="mono">{e.a}–{e.b}</td>
                  <td><DeltaCell now={edgeLength(model, e.a, e.b)!} before={before ? edgeLength(before, e.a, e.b) : undefined} /></td>
                  <td>{e.regions.map((id) => model.regions.find((r) => r.id === id)?.label ?? id).join('／')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="specwrap">
        <table className="spec">
          <thead><tr><th>{inScope.length ? `範圍 ${inScope.length}` : '全部區域'}</th><th /><th>W</th><th>H</th><th>x</th><th>y</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const now = boxOf(model, r)!;
              const b = before ? boxOf(before, r) : undefined;
              const m = materialOf(ed.materials, r.material);
              return (
                <tr key={r.id}>
                  <td>{r.label}</td>
                  <td title={m.name}><span className="sw" style={{ background: m.fill, marginRight: 0 }} /></td>
                  <td><DeltaCell now={now.w} before={b?.w} /></td>
                  <td><DeltaCell now={now.h} before={b?.h} /></td>
                  <td><DeltaCell now={now.x} before={b?.x} /></td>
                  <td><DeltaCell now={now.y} before={b?.y} /></td>
                </tr>
              );
            })}
            {scopeBox && (
              <tr className="sum">
                <td colSpan={2}>範圍外框</td>
                <td><DeltaCell now={scopeBox.x1 - scopeBox.x0} before={scopeBoxBefore ? scopeBoxBefore.x1 - scopeBoxBefore.x0 : undefined} /></td>
                <td><DeltaCell now={scopeBox.y1 - scopeBox.y0} before={scopeBoxBefore ? scopeBoxBefore.y1 - scopeBoxBefore.y0 : undefined} /></td>
                <td><DeltaCell now={scopeBox.x0} before={scopeBoxBefore?.x0} /></td>
                <td><DeltaCell now={scopeBox.y0} before={scopeBoxBefore?.y0} /></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <small className="dim">單位 nm；y 往下為正；x,y 為左上角。小字為相對基準的差異。</small>
    </Section>
  );
}

export function ParamsPanel({ ed }: { ed: Editor }) {
  const { model, mode, selected } = ed;
  const [dx, setDx] = useState(2);
  const [dy, setDy] = useState(0);
  const [off, setOff] = useState(2);
  const [bw, setBw] = useState(8);
  const [bh, setBh] = useState(5);
  const [bt, setBt] = useState(50);
  const [from, setFrom] = useState('');
  const edge = mode === 'edge' && selected.length === 1 ? ed.edgeByKey.get(selected[0]) : undefined;
  const sides = useMemo(() => (edge ? edge.regions.map((id) => model.regions.find((r) => r.id === id)!) : []), [edge, model]);
  useEffect(() => {
    if (sides.length && !sides.some((r) => r.id === from)) setFrom(sides[0].id);
  }, [sides, from]);
  const noun = mode === 'region' ? '區域' : mode === 'edge' ? '邊' : '頂點';
  return (
    <Section title="參數調整">
      {!selected.length && <small className="dim">先選取區域／邊／頂點。</small>}
      {mode === 'vertex' && selected.length === 1 && (() => {
        const v = model.vertices[selected[0]];
        return (
          <div className="row">
            <NumField label="x (nm)" value={v.x} onChange={(x) => ed.setVertexPos(v.id, x, v.y)} />
            <NumField label="y (nm)" value={v.y} onChange={(y) => ed.setVertexPos(v.id, v.x, y)} />
          </div>
        );
      })()}
      {edge && (
        <>
          <div className="row">
            <NumField label="沿法線位移 (nm)" value={off} onChange={setOff} />
            <button onClick={() => ed.applyNormalOffset(off)}>套用</button>
          </div>
          <div className="sub">插入凸起／凹陷</div>
          <div className="row">
            <NumField label="寬" value={bw} onChange={setBw} w={70} />
            <NumField label="高(負=凹)" value={bh} onChange={setBh} w={70} />
            <NumField label="位置 %" value={bt} onChange={setBt} step={1} w={70} />
          </div>
          <div className="row">
            <label className="num">
              <span>哪個材質凸出</span>
              <select value={from} onChange={(e) => setFrom(e.target.value)}>
                {sides.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </label>
            <button className="primary" onClick={() => ed.addBump(edge.key, { width: bw, height: bh, t: bt / 100, fromRegion: from })}>插入</button>
          </div>
        </>
      )}
      {selected.length > 0 && (mode === 'region' || selected.length > 1) && (
        <>
          <div className="sub">{noun} ×{selected.length}：整體位移（動到 {ed.movingVertices.size} 個頂點）</div>
          <div className="row">
            <NumField label="Δx (nm)" value={dx} onChange={setDx} w={80} />
            <NumField label="Δy (nm)" value={dy} onChange={setDy} w={80} />
            <button onClick={() => ed.nudge(dx, dy)}>套用</button>
          </div>
          {mode === 'edge' && (
            <div className="row">
              <NumField label="沿各自法線 (nm)" value={off} onChange={setOff} />
              <button onClick={() => ed.applyNormalOffset(off)}>套用</button>
            </div>
          )}
        </>
      )}
    </Section>
  );
}
