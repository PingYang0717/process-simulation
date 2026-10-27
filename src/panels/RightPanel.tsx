import { useMemo, useState } from 'react';
import type { Editor } from '../editor/useEditor';
import { MAX_S, MIN_S, niceStep } from '../editor/view';
import { NOMINAL, PARAM_DEFS, deltaRange, displayCut } from '../model/device';
import { bboxOf, edgeFrame, edgeLength, polyOf } from '../model/geometry';
import { MATERIALS, materialOf } from '../model/materials';
import type { Model, Region } from '../model/types';
import { DeltaCell, NumField, Section, fmt } from './ui';

const cutName = { x: 'X', y: 'Y', z: 'Z' } as const;

function ZoomPanel({ ed }: { ed: Editor }) {
  const { view, size } = ed;
  const bar = niceStep(view.s, 120);
  const grid = niceStep(view.s, 70);
  const lg = (v: number) => Math.log(v);
  return (
    <Section title="比例尺與視圖" right={`${(view.s * 100).toFixed(0)}%`}>
      <div className="scalebar">
        <svg width="100%" height={34}>
          <line x1={10} x2={10 + bar * view.s} y1={22} y2={22} stroke="#1B2430" strokeWidth={2} />
          <line x1={10} x2={10} y1={17} y2={27} stroke="#1B2430" />
          <line x1={10 + bar * view.s} x2={10 + bar * view.s} y1={17} y2={27} stroke="#1B2430" />
          <text x={10} y={12} fontSize={11} fill="#1B2430">{`${+bar.toFixed(3)} nm = ${(bar * view.s).toFixed(0)} px`}</text>
        </svg>
      </div>
      <input
        type="range"
        className="slider"
        min={lg(MIN_S)}
        max={lg(MAX_S)}
        step={0.01}
        value={lg(view.s)}
        onChange={(e) => ed.zoomTo(Math.exp(+e.target.value))}
      />
      <div className="row">
        <button onClick={() => ed.zoomBy(0.8)}>−</button>
        <button onClick={() => ed.zoomBy(1.25)}>+</button>
        <button onClick={ed.fitView}>適合視窗</button>
        <button onClick={() => ed.zoomTo(1)}>100%</button>
      </div>
      <div className="small dim mono">
        格線 {+grid.toFixed(3)} nm · 可視 x {fmt(-view.tx / view.s)}…{fmt((size.w - view.tx) / view.s)}，y {fmt(-view.ty / view.s)}…{fmt((size.h - view.ty) / view.s)}
      </div>
    </Section>
  );
}

function DeviceParamsPanel({ ed }: { ed: Editor }) {
  const p = ed.doc.params;
  const base = ed.baseline?.doc.params;
  const active =
    ed.mode === 'edge' && ed.itemSel.length === 1 ? ed.bindings.get(ed.itemSel[0])?.param : undefined;
  return (
    <Section title="元件參數" right="三剖面共用 · nm">
      <table className="spec params">
        <thead>
          <tr><th>參數</th><th>剖面</th><th>值</th><th>範圍</th></tr>
        </thead>
        <tbody>
          {PARAM_DEFS.map((d) => {
            const c = displayCut(ed.cut, d.key);
            const nom = NOMINAL[c][d.key]!;
            const [lo, hi] = deltaRange(d.key, p);
            const delta = base ? p[d.key] - base[d.key] : 0;
            return (
              <tr key={d.key} className={active === d.key ? 'active' : undefined} title={d.desc}>
                <td>
                  <b>{d.label}</b>
                  <small className="dim block">{d.desc}</small>
                </td>
                <td className="mono">
                  {d.cuts.map((k) => (
                    <span key={k} className={k === c ? 'curcut' : undefined}>{cutName[k]}</span>
                  ))}
                </td>
                <td>
                  <div className="pval">
                    <NumField label="" value={nom + p[d.key]} step={d.key === 'Tox' ? 0.1 : 1} onChange={(v) => ed.setParamValue(d.key, v - nom)} width={74} />
                    {Math.abs(delta) >= 0.05 && (
                      <small className={delta > 0 ? 'up' : 'dn'}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}</small>
                    )}
                  </div>
                </td>
                <td className="mono dim">{fmt(nom + lo)}–{fmt(nom + hi)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <small className="dim">
        prototype 各剖面原尺寸不同，數值顯示粗體剖面的實際值；改動量 Δ 同步套到其他剖面。邊模式下橘色虛線的邊綁定參數，拖它就是改參數；自由編輯只影響目前剖面。
      </small>
    </Section>
  );
}

function EditParamsPanel({ ed }: { ed: Editor }) {
  const { mode, itemSel, regionSel, model, edgeByKey, bindings } = ed;
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [off, setOff] = useState(1);
  const [bw, setBw] = useState(8);
  const [bh, setBh] = useState(5);
  const [bt, setBt] = useState(50);
  const [from, setFrom] = useState('');

  const singleEdge = mode === 'edge' && itemSel.length === 1 ? edgeByKey.get(itemSel[0]) : undefined;
  const singleVertex = mode === 'vertex' && itemSel.length === 1 ? model.vertices[itemSel[0]] : undefined;
  const regionLabel = (id: string) => model.regions.find((r) => r.id === id)?.label ?? id;

  let body;
  if (singleVertex) {
    body = (
      <>
        <div className="small dim">頂點 <span className="mono">{singleVertex.id}</span> 絕對座標</div>
        <div className="row">
          <NumField label="x (nm)" value={singleVertex.x} onChange={(x) => ed.setVertex(singleVertex.id, [x, singleVertex.y])} step={0.1} />
          <NumField label="y (nm)" value={singleVertex.y} onChange={(y) => ed.setVertex(singleVertex.id, [singleVertex.x, y])} step={0.1} />
        </div>
      </>
    );
  } else if (mode === 'edge' && itemSel.length) {
    const bd = singleEdge ? bindings.get(singleEdge.key) : undefined;
    const fromId = singleEdge && singleEdge.regions.includes(from) ? from : singleEdge?.regions[0] ?? '';
    body = (
      <>
        {bd && (
          <div className="note">
            此邊綁定 <b>{PARAM_DEFS.find((p) => p.key === bd.param)!.label}</b>，拖拉或在「元件參數」改值會連動三個剖面；下方操作屬自由編輯，只影響目前剖面。
          </div>
        )}
        <div className="sub">沿法線位移（{itemSel.length} 條邊）</div>
        <div className="row">
          <NumField label="位移 (nm)" value={off} onChange={setOff} step={0.1} />
          <button className="primary" onClick={() => ed.applyNormalOffset(off)}>套用</button>
        </div>
        {singleEdge && (
          <>
            <div className="sub">插入凸起／凹陷</div>
            <div className="row">
              <NumField label="寬 (nm)" value={bw} onChange={setBw} width={70} />
              <NumField label="高 (nm)" value={bh} onChange={setBh} width={70} />
              <NumField label="位置 %" value={bt} onChange={setBt} width={70} />
            </div>
            <div className="row">
              <label className="num" style={{ width: '100%' }}>
                哪個材質凸出
                <select value={fromId} onChange={(e) => setFrom(e.target.value)}>
                  {singleEdge.regions.map((id) => (
                    <option key={id} value={id}>{regionLabel(id)}（{materialOf(model.regions.find((r) => r.id === id)!.material).name}）</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="row">
              <button onClick={() => ed.addBump(singleEdge.key, { width: bw, height: Math.abs(bh), t: bt / 100, fromRegion: fromId })}>插入凸起</button>
              <button onClick={() => ed.addBump(singleEdge.key, { width: bw, height: -Math.abs(bh), t: bt / 100, fromRegion: fromId })}>插入凹陷</button>
              <button onClick={() => ed.splitEdge(singleEdge.key, bt / 100)}>在 {bt}% 插頂點</button>
            </div>
            <div className="small dim mono">
              長度 {fmt(edgeFrame(model, singleEdge).length)} nm · 共用：{singleEdge.regions.map(regionLabel).join('／')}
            </div>
          </>
        )}
      </>
    );
  } else if ((mode === 'region' && regionSel.length) || (mode === 'vertex' && itemSel.length)) {
    const n = mode === 'region' ? regionSel.length : itemSel.length;
    body = (
      <>
        <div className="small dim">{n} 個{mode === 'region' ? '區域' : '頂點'}整體位移</div>
        <div className="row">
          <NumField label="Δx (nm)" value={dx} onChange={setDx} step={0.1} width={80} />
          <NumField label="Δy (nm)" value={dy} onChange={setDy} step={0.1} width={80} />
          <button className="primary" onClick={() => ed.nudge(dx, dy)}>套用</button>
        </div>
      </>
    );
  } else {
    body = <div className="small dim">選取區域、邊或頂點後，在這裡輸入數值調整。</div>;
  }
  return <Section title="編輯參數">{body}</Section>;
}

function regionBox(model: Model, r: Region) {
  const b = bboxOf(polyOf(model, r));
  return { w: b.x1 - b.x0, h: b.y1 - b.y0, x: b.x0, y: b.y0 };
}

function SpecPreview({ ed }: { ed: Editor }) {
  const { model, regionSel, scope, mode, itemSel, edgeByKey, baseline, cut } = ed;
  const before = baseline?.doc.cuts[cut];
  const [showAll, setShowAll] = useState(false);
  const ids = mode === 'region' ? regionSel : scope;
  const list = ids.length ? model.regions.filter((r) => ids.includes(r.id)) : model.regions;
  const shown = ids.length || showAll ? list : list.slice(0, 12);
  const multi = useMemo(() => {
    if (ids.length < 2) return null;
    const sel = model.regions.filter((r) => ids.includes(r.id));
    const bb = (m: Model) => {
      const rs = sel.map((r) => m.regions.find((x) => x.id === r.id)).filter((r): r is Region => !!r);
      return bboxOf(rs.flatMap((r) => polyOf(m, r)));
    };
    return { now: bb(model), before: before ? bb(before) : undefined };
  }, [ids, model, before]);
  const selEdges = mode === 'edge' ? itemSel.map((k) => edgeByKey.get(k)).filter((e) => !!e) : [];
  const label = (id: string) => model.regions.find((r) => r.id === id)?.label ?? id;

  return (
    <Section title="Spec Preview" right={ids.length ? `範圍內 ${list.length} 個區域` : `全部 ${list.length} 個區域`}>
      <div className="row base">
        <span className="dim">基準：</span>
        <span>{baseline ? `${baseline.label}${baseline.pinned ? '（已釘選）' : ''}` : '無（開始編輯時自動記錄）'}</span>
        <span className="grow" />
        <button onClick={ed.pinBaseline}>釘選現況為基準</button>
        <button onClick={ed.clearBaseline} disabled={!baseline}>清除</button>
      </div>
      <div className="specwrap">
        <table className="spec">
          <thead>
            <tr><th>區域</th><th>材質</th><th>W</th><th>H</th><th>x</th><th>y</th></tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const now = regionBox(model, r);
              const br = before?.regions.find((x) => x.id === r.id);
              const b = br && before ? regionBox(before, br) : undefined;
              return (
                <tr key={r.id}>
                  <td>{r.label}</td>
                  <td><span className="sw" style={{ background: materialOf(r.material).fill }} /></td>
                  <td><DeltaCell now={now.w} before={b?.w} /></td>
                  <td><DeltaCell now={now.h} before={b?.h} /></td>
                  <td><DeltaCell now={now.x} before={b?.x} /></td>
                  <td><DeltaCell now={now.y} before={b?.y} /></td>
                </tr>
              );
            })}
            {multi && (
              <tr className="sum">
                <td colSpan={2}>多選外框</td>
                <td><DeltaCell now={multi.now.x1 - multi.now.x0} before={multi.before && multi.before.x1 - multi.before.x0} /></td>
                <td><DeltaCell now={multi.now.y1 - multi.now.y0} before={multi.before && multi.before.y1 - multi.before.y0} /></td>
                <td><DeltaCell now={multi.now.x0} before={multi.before?.x0} /></td>
                <td><DeltaCell now={multi.now.y0} before={multi.before?.y0} /></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!ids.length && list.length > 12 && (
        <button onClick={() => setShowAll((v) => !v)}>{showAll ? '收合' : `顯示全部 ${list.length} 個`}</button>
      )}
      {selEdges.length > 0 && (
        <>
          <div className="sub">已選邊長度</div>
          <div className="specwrap">
            <table className="spec">
              <thead><tr><th>邊</th><th>共用區域</th><th>長度</th></tr></thead>
              <tbody>
                {selEdges.map((e) => (
                  <tr key={e.key}>
                    <td className="mono">{e.a}–{e.b}</td>
                    <td>{e.regions.map(label).join('／')}</td>
                    <td><DeltaCell now={edgeLength(model, e.a, e.b)} before={before ? edgeLength(before, e.a, e.b) : undefined} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Section>
  );
}

function MaterialPanel({ ed }: { ed: Editor }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    ed.model.regions.forEach((r) => m.set(r.material, (m.get(r.material) ?? 0) + 1));
    return m;
  }, [ed.model]);
  const cur = new Set(ed.model.regions.filter((r) => ed.regionSel.includes(r.id)).map((r) => r.material));
  return (
    <Section title="材質" right={ed.regionSel.length ? `點一下套用到 ${ed.regionSel.length} 個區域` : '點一下選取同材質區域'}>
      <div className="mats">
        {MATERIALS.map((m) => (
          <button key={m.id} className={`mat ${cur.has(m.id) ? 'cur' : ''} ${ed.regionSel.length ? 'apply' : ''}`} onClick={() => ed.pickMaterial(m.id)}>
            <span className="sw" style={{ background: m.fill }} />
            <span className="nm">{m.name}</span>
            <span className="ct">{counts.get(m.id) ?? 0}</span>
          </button>
        ))}
      </div>
    </Section>
  );
}

export function RightPanel({ ed }: { ed: Editor }) {
  return (
    <aside className="rightbar">
      <ZoomPanel ed={ed} />
      <DeviceParamsPanel ed={ed} />
      <EditParamsPanel ed={ed} />
      <SpecPreview ed={ed} />
      <MaterialPanel ed={ed} />
    </aside>
  );
}
