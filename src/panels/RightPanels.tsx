import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '../editor/useEditor';
import { MAX_S, MIN_S, niceStep, signed } from '../editor/view';
import { bboxOf, edgeLength, polyOf } from '../model/geometry';
import type { Model, Region } from '../model/types';
import type { Underlay } from '../canvas/RasterUnderlay';
import { materialOf } from '../raster/exportRaster';
import type { ExportResult } from '../raster/exportRaster';
import { PxCell, Section } from './ui';

export interface Display {
  underlay: Underlay; setUnderlay: (u: Underlay) => void;
  alpha: number; setAlpha: (a: number) => void;
  showDiff: boolean; setShowDiff: (v: boolean) => void;
  showLabels: boolean; setShowLabels: (v: boolean) => void;
}

export function ViewPanel({ ed, d }: { ed: Editor; d: Display }) {
  return (
    <Section title="顯示">
      <div className="seg">
        {([['output', '輸出'], ['original', '原圖'], ['compare', '前後比對'], ['none', '無底圖']] as [Underlay, string][]).map(([k, label]) => (
          <button key={k} className={d.underlay === k ? 'on' : ''} onClick={() => d.setUnderlay(k)}>{label}</button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <label className="chk"><input type="checkbox" checked={d.showDiff} onChange={(e) => d.setShowDiff(e.target.checked)} /> 改過的地方框紅線</label>
        <label className="chk"><input type="checkbox" checked={d.showLabels} onChange={(e) => d.setShowLabels(e.target.checked)} /> 顯示區域名稱</label>
      </div>
      {d.underlay === 'compare' && <small className="dim">左邊原圖、右邊輸出，縮放與移動同步。</small>}
      <div className="sub">編輯方式</div>
      <label className="chk">
        <input type="checkbox" checked={ed.follow} onChange={(e) => ed.setFollow(e.target.checked)} /> 推邊時，外面包著的薄層一起推
      </label>
      <label className="chk">
        <input type="checkbox" checked={ed.mirror} onChange={(e) => ed.setMirror(e.target.checked)} /> 選了多個相同結構時，一起改對應的位置
      </label>
      <label className="num" style={{ width: '100%' }}>
        <span>區域上色深淺 {Math.round(d.alpha * 100)}%</span>
        <input type="range" min={0} max={1} step={0.05} value={d.alpha} onChange={(e) => d.setAlpha(+e.target.value)} />
      </label>
      <div className="row">
        <button onClick={() => ed.zoomAt(0.8)}>−</button>
        <input type="range" min={Math.log(MIN_S)} max={Math.log(MAX_S)} step={0.01} value={Math.log(ed.view.s)} onChange={(e) => ed.setZoom(Math.exp(+e.target.value))} style={{ flex: 1 }} />
        <button onClick={() => ed.zoomAt(1.25)}>+</button>
      </div>
      <div className="row">
        <span className="mono">{Math.round(ed.view.s * 100)}%</span>
        <button onClick={() => ed.fit()}>適合視窗</button>
        <button onClick={() => ed.setZoom(1)}>1:1</button>
        <button onClick={() => ed.setZoom(8)}>8×</button>
        <button className={ed.panMode ? 'on' : ''} onClick={() => ed.setPanMode(!ed.panMode)} title="拖曳畫面（H）">✋</button>
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
  const [editing, setEditing] = useState<string | null>(null);
  const apply = ed.regionSel.length > 0;
  const current = new Set(ed.model.regions.filter((r) => apply && ed.regionSel.includes(r.id)).map((r) => r.material));
  return (
    <Section title="材質" right={<small className="dim">{apply ? `點一下＝套用到 ${ed.regionSel.length} 個區域` : '點一下＝選取同材質'}；雙擊改名</small>}>
      <div className="mats">
        {ed.materials.map((m) => (
          <button
            key={m.id}
            className={'mat' + (current.has(m.id) ? ' cur' : '') + (m.isVoid ? ' void' : '')}
            onClick={() => editing !== m.id && (apply ? ed.setMaterial(m.id) : ed.selectByMaterial(m.id))}
            onDoubleClick={() => setEditing(m.id)}
          >
            <span className="sw" style={{ background: m.fill }} />
            {editing === m.id ? (
              <input
                autoFocus
                defaultValue={m.name}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => { ed.renameMaterial(m.id, e.target.value.trim()); setEditing(null); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') { (e.target as HTMLInputElement).value = m.name; setEditing(null); }
                }}
              />
            ) : (
              <span className="nm">{m.name}</span>
            )}
            <span className="ct">{counts[m.id] ?? ''}</span>
          </button>
        ))}
      </div>
    </Section>
  );
}

const save = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};

export function ExportPanel({ ed, backfill, setBackfill, result }: { ed: Editor; backfill: string; setBackfill: (id: string) => void; result: ExportResult }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { width: W, height: H } = ed.imported;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = W;
    c.height = H;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(result.data), W, H), 0, 0);
  }, [result, W, H]);
  const downloadPng = () => ref.current?.toBlob((b) => b && save(b, `tcad-${ed.cut}-edited.png`), 'image/png');
  // 每像素灰階 = 材質索引（0 起算，VOID 為最後一個）
  const downloadLabels = () => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const img = new ImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const v = result.labelMap[i];
      img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    c.getContext('2d')!.putImageData(img, 0, 0);
    c.toBlob((b) => b && save(b, `tcad-${ed.cut}-labels.png`), 'image/png');
  };
  const pct = ((result.diffPx / (W * H)) * 100).toFixed(2);
  // 不在調色盤的像素不計入輸出欄，合計才會露出差額
  const sumBefore = result.byMaterial.reduce((s, t) => s + t.before, 0);
  const sumAfter = result.byMaterial.reduce((s, t) => s + t.after, 0);
  return (
    <Section title="輸出 PNG" right={<small className="dim">{W} × {H} px，與輸入相同</small>}>
      <canvas ref={ref} className="thumb" style={{ width: '100%', imageRendering: 'pixelated' }} />
      <div className="small">
        {result.diffPx ? `改動了 ${result.diffPx.toLocaleString()} 個像素（${pct}%），涉及 ${result.changed.length} 個區域` : '尚未改動，輸出與原圖完全相同'}
      </div>
      {result.warnings.length > 0 && (
        <div className="warn">{result.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}</div>
      )}
      {result.diffPx > 0 && (
        <table className="spec acct">
          <thead>
            <tr><th>材質面積帳</th><th>原圖 px</th><th>輸出 px</th><th>增減</th></tr>
          </thead>
          <tbody>
            {result.byMaterial.filter((t) => t.before !== t.after).map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{t.before.toLocaleString()}</td>
                <td>{t.after.toLocaleString()}</td>
                <td className={t.after > t.before ? 'up' : 'dn'}>{signed(t.after - t.before)}</td>
              </tr>
            ))}
            <tr className="sum">
              <td>合計</td>
              <td>{sumBefore.toLocaleString()}</td>
              <td>{sumAfter.toLocaleString()}</td>
              <td>{signed(sumAfter - sumBefore)}</td>
            </tr>
          </tbody>
        </table>
      )}
      <div className="row">
        <label className="num" style={{ width: 150 }}>
          <span>搬走後空出的地方填</span>
          <select value={backfill} onChange={(e) => setBackfill(e.target.value)}>
            {ed.materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <button className="primary" onClick={downloadPng}>下載 PNG</button>
        <button onClick={downloadLabels}>下載材質編號圖</button>
      </div>
      <small className="dim">
        沒改到的像素保持原樣。「材質編號圖」是灰階圖，每個像素的亮度代表它是第幾種材質（照上面材質清單的順序，從 0 開始）。
      </small>
    </Section>
  );
}

const boxOf = (m: Model, r: Region) => {
  const cur = m.regions.find((x) => x.id === r.id);
  if (!cur) return undefined;
  const b = bboxOf(polyOf(m, cur));
  return { w: b.x1 - b.x0, h: b.y1 - b.y0, x: b.x0, y: b.y0 };
};

export function SpecPanel({ ed }: { ed: Editor }) {
  const { model, baseline, view } = ed;
  const k = ed.nmPerPx;
  const base = baseline?.model;
  const picked = model.regions.filter((r) => ed.regionSel.includes(r.id));
  const rows = picked.length ? picked : model.regions;
  const edges = ed.edgeSel.map((key) => ed.edgeByKey.get(key)).filter((e) => !!e);
  return (
    <Section title="尺寸">
      <div className="small">1 像素 = {k} nm　格線間距 {niceStep(view.s / k)} nm</div>
      <div className="row base">
        <span className="dim">{base ? `比較基準：${baseline!.label}${baseline!.pinned ? '（固定）' : ''}` : '比較基準：尚無'}</span>
        <button onClick={ed.pinBaseline}>以現在為基準</button>
        {base && <button onClick={ed.clearBaseline}>清除</button>}
      </div>
      {edges.length > 0 && (() => {
        const total = (m: Model) => edges.reduce((sum, e) => sum + (edgeLength(m, e.a, e.b) ?? 0), 0);
        const now = total(model), was = base ? total(base) : undefined;
        return (
          <div className="small">
            已選 {edges.length} 段邊，總長 {now.toFixed(1)} px（{(now * k).toFixed(1)} nm）
            {was !== undefined && Math.abs(now - was) > 0.05 && <span className={now > was ? 'up' : 'dn'}>　比基準 {signed(now - was, 1)} px</span>}
          </div>
        );
      })()}
      <div className="specwrap">
        <table className="spec">
          <thead>
            <tr><th>{picked.length ? `已選 ${picked.length}` : '全部'}</th><th /><th>W</th><th>H</th><th>x</th><th>y</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const now = boxOf(model, r)!;
              const was = base ? boxOf(base, r) : undefined;
              const mat = materialOf(ed.materials, r.material);
              return (
                <tr key={r.id}>
                  <td>{r.label}</td>
                  <td title={mat.name}><span className="sw" style={{ background: mat.fill, marginRight: 0 }} /></td>
                  <td><PxCell now={now.w} before={was?.w} nmPerPx={k} /></td>
                  <td><PxCell now={now.h} before={was?.h} nmPerPx={k} /></td>
                  <td><PxCell now={now.x} before={was?.x} nmPerPx={k} /></td>
                  <td><PxCell now={now.y} before={was?.y} nmPerPx={k} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <small className="dim">寬、高、位置以區域的外框計算（y 往下為正）；小字是 nm，以及和比較基準相比的變化。</small>
    </Section>
  );
}
