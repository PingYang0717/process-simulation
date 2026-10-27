import { useEffect, useMemo, useRef } from 'react';
import type { MouseEvent as RMouseEvent, PointerEvent as RPointerEvent } from 'react';
import type { Editor } from '../editor/useEditor';
import { niceStep, toNm, toPx } from '../editor/view';
import type { View } from '../editor/view';
import { bboxOf, centroid, pointInPoly, polyOf, projectOnSegment } from '../model/geometry';
import { materialOf } from '../model/materials';
import { PARAM_DEFS } from '../model/device';
import type { XY } from '../model/types';

const ACCENT = '#1F5EFF';
const BOUND = '#B7791F';
const RULER = 20;

const isDark = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 120;
};
const fmt = (v: number) => (Math.abs(v) < 0.05 ? '0' : v.toFixed(1));
const sgn = (v: number) => (v > 0 ? `+${fmt(v)}` : fmt(v));

export function SectionCanvas({ ed }: { ed: Editor }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pan = useRef<{ px: XY; view: View; id: number } | null>(null);
  const { model, view, size, mode, regionSel, itemSel, scope, edges, bindings } = ed;

  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      ed.setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ed.setSize]);

  // React 的 onWheel 擋不住頁面捲動，手動掛 passive:false
  useEffect(() => {
    const svg = svgRef.current!;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      ed.zoomBy(Math.exp(-e.deltaY * 0.0015), [e.clientX - r.left, e.clientY - r.top]);
    };
    svg.addEventListener('wheel', h, { passive: false });
    return () => svg.removeEventListener('wheel', h);
  }, [ed.zoomBy]);

  const local = (e: { clientX: number; clientY: number }): XY => {
    const r = svgRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const nmOf = (e: { clientX: number; clientY: number }) => toNm(view, local(e));
  const mods = (e: RPointerEvent) => ({ shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
  const panning = ed.panMode || ed.spaceDown;

  const onBgDown = (e: RPointerEvent<SVGSVGElement>) => {
    svgRef.current!.setPointerCapture(e.pointerId);
    if (panning || e.button === 1) {
      e.preventDefault();
      pan.current = { px: local(e), view, id: e.pointerId };
      return;
    }
    if (e.button !== 0) return;
    ed.pointerDownEmpty(nmOf(e), mods(e));
  };
  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    const p = pan.current;
    if (p) {
      const [x, y] = local(e);
      ed.setView({ ...p.view, tx: p.view.tx + x - p.px[0], ty: p.view.ty + y - p.px[1] });
      return;
    }
    ed.pointerMove(nmOf(e));
  };
  const onUp = () => {
    pan.current = null;
  };
  // 指標被 svg capture，dblclick 的 target 會是 svg，所以在這裡找最近的邊
  const onDbl = (e: RMouseEvent<SVGSVGElement>) => {
    if (mode !== 'edge' || panning) return;
    const [px, py] = local(e);
    let best: string | undefined, bd = 8;
    for (const ed2 of visibleEdges) {
      const a = toPx(view, [model.vertices[ed2.a].x, model.vertices[ed2.a].y]);
      const b = toPx(view, [model.vertices[ed2.b].x, model.vertices[ed2.b].y]);
      const d = projectOnSegment([px, py], a, b).dist;
      if (d < bd) { bd = d; best = ed2.key; }
    }
    if (best) ed.splitEdge(best, nmOf(e));
  };
  const itemDown = (id: string) => (e: RPointerEvent) => {
    if (panning || e.button !== 0) return;
    e.stopPropagation();
    svgRef.current!.setPointerCapture(e.pointerId);
    ed.pointerDownItem(id, nmOf(e), mods(e));
  };

  const P = (x: number, y: number) => toPx(view, [x, y]);
  const ptsStr = (pts: XY[]) => pts.map(([x, y]) => P(x, y).map((v) => v.toFixed(2)).join(',')).join(' ');

  // 格線
  const step = niceStep(view.s, 70);
  const nmX0 = -view.tx / view.s, nmX1 = (size.w - view.tx) / view.s;
  const nmY0 = -view.ty / view.s, nmY1 = (size.h - view.ty) / view.s;
  const gx: number[] = [], gy: number[] = [];
  for (let x = Math.ceil(nmX0 / step) * step; x <= nmX1; x += step) gx.push(x);
  for (let y = Math.ceil(nmY0 / step) * step; y <= nmY1; y += step) gy.push(y);

  const inScope = (regions: string[]) => !scope.length || regions.some((id) => scope.includes(id));
  const visibleEdges = useMemo(() => edges.filter((e) => inScope(e.regions)), [edges, scope]);
  const visibleVerts = useMemo(() => {
    if (!scope.length) return Object.keys(model.vertices);
    return [...new Set(scope.flatMap((id) => model.regions.find((r) => r.id === id)?.loop ?? []))];
  }, [model, scope]);

  const selRegions = model.regions.filter((r) => regionSel.includes(r.id));
  const drag = ed.drag;

  return (
    <div ref={wrapRef} className="canvas-wrap" style={{ cursor: panning ? 'grab' : 'default' }}>
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        style={{ display: 'block', touchAction: 'none' }}
        onPointerDown={onBgDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onDoubleClick={onDbl}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* 格線 */}
        <g stroke="var(--grid)" strokeWidth={1}>
          {gx.map((x) => { const [px] = P(x, 0); return <line key={`x${x}`} x1={px} x2={px} y1={0} y2={size.h} />; })}
          {gy.map((y) => { const [, py] = P(0, y); return <line key={`y${y}`} x1={0} x2={size.w} y1={py} y2={py} />; })}
        </g>

        {/* 區域 */}
        <g>
          {model.regions.map((r) => {
            const dim = scope.length > 0 && !scope.includes(r.id);
            return (
              <polygon
                key={r.id}
                className={mode === 'region' ? 'hit' : undefined}
                points={ptsStr(polyOf(model, r))}
                fill={materialOf(r.material).fill}
                fillOpacity={dim ? 0.45 : 1}
                stroke="rgba(27,36,48,.35)"
                strokeWidth={1}
                strokeLinejoin="round"
                style={{ pointerEvents: mode === 'region' && !panning ? 'auto' : 'none' }}
                onPointerDown={itemDown(r.id)}
              >
                <title>{`${r.label} · ${materialOf(r.material).name}`}</title>
              </polygon>
            );
          })}
        </g>

        {/* 材質標籤 */}
        <g fontFamily="var(--mono)" fontSize={10} fill="#1B2430" textAnchor="middle" style={{ pointerEvents: 'none' }}>
          {model.regions.map((r) => {
            const pts = polyOf(model, r);
            const b = bboxOf(pts);
            const textW = [...r.label].reduce((w, ch) => w + (ch.charCodeAt(0) > 255 ? 10 : 6.1), 0) + 6;
            if ((b.x1 - b.x0) * view.s < textW || (b.y1 - b.y0) * view.s < 14) return null;
            const c = centroid(pts);
            if (!pointInPoly(c, pts)) return null; // U 形等凹多邊形，質心落在洞裡就不標
            const [cx, cy] = P(...c);
            return <text key={r.id} x={cx} y={cy + 3.5} fill={isDark(materialOf(r.material).fill) ? '#fff' : '#1B2430'}>{r.label}</text>;
          })}
        </g>

        {/* 選取的區域外框／編輯範圍 */}
        <g fill="none" style={{ pointerEvents: 'none' }}>
          {selRegions.map((r) => (
            <polygon key={r.id} points={ptsStr(polyOf(model, r))} stroke={ACCENT} strokeWidth={mode === 'region' ? 2.5 : 1.5} strokeDasharray={mode === 'region' ? undefined : '5 3'} />
          ))}
        </g>

        {/* 邊 */}
        {mode === 'edge' && (
          <g>
            {visibleEdges.map((e) => {
              const a = model.vertices[e.a], b = model.vertices[e.b];
              const [x1, y1] = P(a.x, a.y), [x2, y2] = P(b.x, b.y);
              const sel = itemSel.includes(e.key);
              const bd = bindings.get(e.key);
              return (
                <g key={e.key}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={sel ? ACCENT : bd ? BOUND : '#2B3440'} strokeWidth={sel ? 3.5 : bd ? 2.2 : 1.2} strokeDasharray={bd && !sel ? '6 3' : undefined} strokeLinecap="round" />
                  <line
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="transparent" strokeWidth={12} strokeLinecap="round"
                    style={{ cursor: bd ? 'ew-resize' : 'move', pointerEvents: panning ? 'none' : 'stroke' }}
                    onPointerDown={itemDown(e.key)}
                  >
                    <title>{bd ? `綁定參數 ${PARAM_DEFS.find((p) => p.key === bd.param)!.label}（拖拉改參數，三個剖面連動）` : '雙擊插入頂點'}</title>
                  </line>
                </g>
              );
            })}
          </g>
        )}

        {/* 頂點 */}
        {mode === 'vertex' && (
          <g>
            {visibleVerts.map((id) => {
              const v = model.vertices[id];
              const [x, y] = P(v.x, v.y);
              const sel = itemSel.includes(id);
              return (
                <g key={id}>
                  <circle cx={x} cy={y} r={sel ? 5 : 3.5} fill={sel ? ACCENT : '#fff'} stroke={sel ? '#fff' : '#1B2430'} strokeWidth={1.3} style={{ pointerEvents: 'none' }} />
                  <circle cx={x} cy={y} r={8} fill="transparent" style={{ cursor: 'move', pointerEvents: panning ? 'none' : 'auto' }} onPointerDown={itemDown(id)} />
                </g>
              );
            })}
          </g>
        )}

        {/* 尺寸標註 */}
        {mode === 'region' && selRegions.length > 0 && selRegions.length <= 4 && (
          <g stroke="#1B2430" strokeWidth={1} fontFamily="var(--mono)" fontSize={10.5} style={{ pointerEvents: 'none' }}>
            {selRegions.map((r) => {
              const b = bboxOf(polyOf(model, r));
              const [x0, y0] = P(b.x0, b.y0), [x1, y1] = P(b.x1, b.y1);
              const ty = y0 - 10, tx = x1 + 10;
              return (
                <g key={r.id}>
                  <line x1={x0} x2={x1} y1={ty} y2={ty} />
                  <line x1={x0} x2={x0} y1={ty - 4} y2={ty + 4} />
                  <line x1={x1} x2={x1} y1={ty - 4} y2={ty + 4} />
                  <text x={(x0 + x1) / 2} y={ty - 4} textAnchor="middle" stroke="none" fill="#1B2430" className="halo">{`W ${fmt(b.x1 - b.x0)}`}</text>
                  <line x1={tx} x2={tx} y1={y0} y2={y1} />
                  <line x1={tx - 4} x2={tx + 4} y1={y0} y2={y0} />
                  <line x1={tx - 4} x2={tx + 4} y1={y1} y2={y1} />
                  <text x={tx + 5} y={(y0 + y1) / 2 + 3.5} stroke="none" fill="#1B2430" className="halo">{`H ${fmt(b.y1 - b.y0)}`}</text>
                </g>
              );
            })}
          </g>
        )}

        {/* 框選 */}
        {ed.box && (() => {
          const [ax, ay] = P(...ed.box.a), [bx, by] = P(...ed.box.b);
          return <rect x={Math.min(ax, bx)} y={Math.min(ay, by)} width={Math.abs(bx - ax)} height={Math.abs(by - ay)} fill="rgba(31,94,255,.08)" stroke={ACCENT} strokeDasharray="4 3" style={{ pointerEvents: 'none' }} />;
        })()}

        {/* 尺規 */}
        <g fontFamily="var(--mono)" fontSize={9.5} fill="var(--muted)" style={{ pointerEvents: 'none' }}>
          <rect x={0} y={0} width={size.w} height={RULER} fill="rgba(247,248,250,.92)" />
          <rect x={0} y={0} width={RULER + 18} height={size.h} fill="rgba(247,248,250,.92)" />
          {gx.map((x) => { const [px] = P(x, 0); return px > RULER + 18 ? <g key={x}><line x1={px} x2={px} y1={RULER - 5} y2={RULER} stroke="var(--faint)" /><text x={px + 2} y={11}>{+x.toFixed(3)}</text></g> : null; })}
          {gy.map((y) => { const [, py] = P(0, y); return py > RULER ? <g key={y}><line x1={RULER + 13} x2={RULER + 18} y1={py} y2={py} stroke="var(--faint)" /><text x={2} y={py + 3}>{+y.toFixed(3)}</text></g> : null; })}
          <text x={4} y={11}>nm</text>
        </g>

        {/* Δ 浮動標籤 */}
        {drag && (() => {
          const [x, y] = P(...drag.at);
          const lines = drag.param
            ? [`${PARAM_DEFS.find((p) => p.key === drag.param!.key)!.label} = ${fmt(drag.param.value)} nm`, `Δ ${sgn(drag.param.delta)} nm · 三剖面連動`]
            : [`Δx ${sgn(drag.dx)}  Δy ${sgn(drag.dy)} nm`, ...(drag.dn !== undefined ? [`沿法線 ${sgn(drag.dn)} nm`] : [])];
          const w = 178, h = 8 + lines.length * 15;
          const lx = Math.min(x + 16, size.w - w - 6), ly = Math.min(y + 16, size.h - h - 6);
          return (
            <g style={{ pointerEvents: 'none' }} fontFamily="var(--mono)" fontSize={11.5}>
              <rect x={lx} y={ly} width={w} height={h} rx={6} fill="#1B2430" opacity={0.9} />
              {lines.map((t, i) => <text key={i} x={lx + 9} y={ly + 17 + i * 15} fill="#fff">{t}</text>)}
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
