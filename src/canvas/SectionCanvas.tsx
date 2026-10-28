import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import type { Editor } from '../editor/useEditor';
import { niceStep, signed } from '../editor/view';
import { isCorner } from '../model/drag';
import { bboxOf, pointInPoly, polyOf, ringsOf } from '../model/geometry';
import type { XY } from '../model/types';
import type { ExportResult } from '../raster/exportRaster';
import { materialOf } from '../raster/exportRaster';
import { VOID_ID } from '../raster/importRaster';
import { RasterUnderlay } from './RasterUnderlay';
import type { Underlay } from './RasterUnderlay';

const ACCENT = '#1F5EFF';
const HOVER = '#F59E0B';
const MONO = 'ui-monospace, Menlo, monospace';

/** 標籤位置：在 12 條水平掃描線中找最寬、且上下各半個字高仍在多邊形內的區段 */
function labelAnchor(pts: XY[], minW: number, textH: number): XY | null {
  const b = bboxOf(pts);
  let best: { w: number; p: XY } | null = null;
  for (let k = 1; k < 12; k++) {
    const y = b.y0 + ((b.y1 - b.y0) * k) / 12;
    const xs: number[] = [];
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (yi <= y !== yj <= y) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((p, q) => p - q);
    for (let s = 0; s + 1 < xs.length; s += 2) {
      const w = xs[s + 1] - xs[s];
      const cx = (xs[s] + xs[s + 1]) / 2;
      if (w >= minW && pointInPoly([cx, y - textH / 2], pts) && pointInPoly([cx, y + textH / 2], pts) && (!best || w > best.w)) {
        best = { w, p: [cx, y] };
      }
    }
  }
  return best?.p ?? null;
}

export function SectionCanvas({ ed, underlay, result, overlayAlpha, showDiff, showLabels }: {
  ed: Editor; underlay: Underlay; result: ExportResult; overlayAlpha: number; showDiff: boolean; showLabels: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 600, h: 500 });
  const [normalPx, setNormalPx] = useState(2);
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const spaceDown = useRef(false);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.floor(entry.contentRect.width), h = Math.floor(entry.contentRect.height);
      setSize({ w, h });
      ed.setCanvasSize(w, h);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [ed.setCanvasSize]);

  // React 的 onWheel 擋不住頁面捲動，手動掛 passive:false；Shift+滾輪為水平平移
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      if (e.ctrlKey || !e.shiftKey) ed.zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
      else ed.panBy(-e.deltaY, 0);
    };
    svg.addEventListener('wheel', h, { passive: false });
    return () => svg.removeEventListener('wheel', h);
  }, [ed.zoomAt, ed.panBy]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement | null)?.matches?.('input,select,textarea')) {
        spaceDown.current = true;
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') spaceDown.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const { model, view, hover } = ed;
  const { w, h } = size;
  const k = ed.nmPerPx;
  const P = (x: number, y: number): XY => [x * view.s + view.tx, y * view.s + view.ty];
  const pxAt = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.tx) / view.s, y: (e.clientY - r.top - view.ty) / view.s };
  };
  const local = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const isPan = (e: RPointerEvent) => ed.panMode || spaceDown.current || e.button === 1;

  const onDown = (e: RPointerEvent) => {
    svgRef.current?.setPointerCapture(e.pointerId);
    if (isPan(e)) {
      pan.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
      return;
    }
    if (e.button === 2) {
      const hit = ed.hitTest(pxAt(e));
      const region = hit.kind === 'region' ? hit.id : hit.kind === 'none' ? null : hit.region;
      if (region) {
        const p = local(e);
        ed.openMenu(region, p.x, p.y);
      }
      return;
    }
    if (e.button === 0) ed.pointerDown(pxAt(e), { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey });
  };
  const onMove = (e: RPointerEvent) => {
    if (pan.current) {
      ed.setView({ s: view.s, tx: pan.current.tx + e.clientX - pan.current.x, ty: pan.current.ty + e.clientY - pan.current.y });
      return;
    }
    ed.pointerMove(pxAt(e));
  };

  // 游標：角 → 十字、邊 → 垂直於邊的雙箭頭、區域 → 四箭頭
  const cursor = ed.panMode ? 'grab'
    : hover.kind === 'vertex' ? 'crosshair'
    : hover.kind === 'edge' ? (() => {
      const e = ed.edgeByKey.get(hover.key);
      if (!e) return 'move';
      const A = model.vertices[e.a], B = model.vertices[e.b];
      return Math.abs(B.x - A.x) > Math.abs(B.y - A.y) ? 'ns-resize' : 'ew-resize';
    })()
    : hover.kind === 'region' ? 'move' : 'default';

  const regionSel = new Set(ed.regionSel);
  const edgeSel = new Set(ed.edgeSel);
  const vertexSel = new Set(ed.vertexSel);
  const hoverEdges = new Set(hover.kind === 'edge' ? hover.group : []);
  const hoverVertex = hover.kind === 'vertex' ? hover.id : null;
  const hoverRegion = hover.kind === 'region' ? hover.id : null;

  // 格線以 nm 取整，標籤顯示 nm
  const step = niceStep(view.s / k) / k;
  const gx: number[] = [], gy: number[] = [];
  for (let x = Math.floor(-view.tx / view.s / step) * step; x <= (w - view.tx) / view.s; x += step) gx.push(x);
  for (let y = Math.floor(-view.ty / view.s / step) * step; y <= (h - view.ty) / view.s; y += step) gy.push(y);
  const nmLabel = (px: number) => {
    const nm = px * k;
    return Math.abs(nm) < 1e-9 ? '0' : nm.toFixed(nm % 1 ? 1 : 0);
  };

  const selBox = (() => {
    const polys = model.regions.filter((r) => regionSel.has(r.id)).map((r) => polyOf(model, r));
    return polys.length ? bboxOf(polys.flat()) : null;
  })();
  const handlesSelected = ed.edgeSel.length || ed.vertexSel.length;
  const floatPos = selBox
    ? (() => {
      const [x, y] = P(selBox.x1, selBox.y0);
      return { left: Math.min(w - 300, Math.max(4, x + 12)), top: Math.max(4, Math.min(h - 40, y - 44)) };
    })()
    : null;

  const handleVertices = [...new Set(
    model.regions
      .filter((r) => ed.activeIds.has(r.id))
      .flatMap((r) => ringsOf(r).flatMap((ring) => ring.filter((_, i) => ed.hold === 'V' || isCorner(model, ring, i)))),
  )];

  return (
    <div ref={wrapRef} className="canvas-wrap" style={{ cursor }}>
      <RasterUnderlay imported={ed.imported} output={result.data} diffMask={result.diffMask} showDiff={showDiff} underlay={underlay} view={view} w={w} h={h} />
      <svg
        ref={svgRef}
        width={w}
        height={h}
        style={{ touchAction: 'none', display: 'block', position: 'relative' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => (pan.current = null)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <rect width={w} height={h} fill={underlay === 'none' ? '#F7F8FA' : 'transparent'} />

        {/* 格線與尺規（nm） */}
        <g pointerEvents="none">
          {gx.map((x) => {
            const [px] = P(x, 0);
            return <line key={'gx' + x} x1={px} y1={0} x2={px} y2={h} stroke="#9AA4B0" strokeOpacity={underlay === 'none' ? 0.35 : 0.25} />;
          })}
          {gy.map((y) => {
            const [, py] = P(0, y);
            return <line key={'gy' + y} x1={0} y1={py} x2={w} y2={py} stroke="#9AA4B0" strokeOpacity={underlay === 'none' ? 0.35 : 0.25} />;
          })}
          <rect x={0} y={0} width={w} height={16} fill="#EEF1F5" opacity={0.95} />
          <rect x={0} y={0} width={36} height={h} fill="#EEF1F5" opacity={0.95} />
          {gx.map((x) => {
            const [px] = P(x, 0);
            return px > 36 ? <text key={'tx' + x} x={px} y={11} fontSize={9.5} textAnchor="middle" fill="#555">{nmLabel(x)}</text> : null;
          })}
          {gy.map((y) => {
            const [, py] = P(0, y);
            return py > 16 ? <text key={'ty' + y} x={33} y={py + 3.5} fontSize={9.5} textAnchor="end" fill="#555">{nmLabel(y)}</text> : null;
          })}
          <text x={2} y={11} fontSize={9} fill="#888">nm</text>
        </g>

        {/* 區域 */}
        {model.regions.map((r) => {
          const sel = regionSel.has(r.id), hov = hoverRegion === r.id, act = ed.activeIds.has(r.id);
          const mat = materialOf(ed.materials, r.material);
          const d = ringsOf(r).map((ring) => 'M' + ring.map((v) => P(model.vertices[v].x, model.vertices[v].y).join(',')).join('L') + 'Z').join(' ');
          return (
            <path
              key={r.id}
              d={d}
              fillRule="evenodd"
              fill={mat.isVoid ? 'url(#voidHatch)' : mat.fill}
              fillOpacity={mat.isVoid ? 0.9 : hov ? Math.min(1, overlayAlpha + 0.2) : overlayAlpha}
              stroke={sel ? ACCENT : act ? '#6B8CFF' : '#4b4b4b'}
              strokeWidth={sel ? 2.5 : act ? 1.5 : 1}
              strokeLinejoin="round"
              pointerEvents="none"
            />
          );
        })}

        {showLabels && (
          <g pointerEvents="none">
            {model.regions.map((r) => {
              const at = labelAnchor(polyOf(model, r), (r.label.length * 7 + 8) / view.s, 16 / view.s);
              if (!at) return null;
              const [x, y] = P(...at);
              return <text key={r.id} x={x} y={y + 3.5} fontSize={10.5} textAnchor="middle" fill="#222">{r.label}</text>;
            })}
          </g>
        )}

        {/* 把手：只在已選或游標所在的區域 */}
        <g pointerEvents="none">
          {ed.edges.filter((e) => e.regions.some((r) => ed.activeIds.has(r))).map((e) => {
            const on = edgeSel.has(e.key), hov = hoverEdges.has(e.key);
            if (!on && !hov) return null;
            const [x1, y1] = P(model.vertices[e.a].x, model.vertices[e.a].y);
            const [x2, y2] = P(model.vertices[e.b].x, model.vertices[e.b].y);
            return <line key={e.key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={on ? ACCENT : HOVER} strokeWidth={4} strokeLinecap="round" />;
          })}
          {handleVertices.map((id) => {
            const v = model.vertices[id];
            const [cx, cy] = P(v.x, v.y);
            const on = vertexSel.has(id), hov = hoverVertex === id;
            return <circle key={id} cx={cx} cy={cy} r={hov ? 6 : on ? 5 : 3} fill={on ? ACCENT : hov ? HOVER : '#fff'} stroke={ACCENT} strokeWidth={1.5} />;
          })}
        </g>

        {/* 已選區域外框尺寸 */}
        {selBox && !handlesSelected && (() => {
          const [x0, y0] = P(selBox.x0, selBox.y0);
          const [x1, y1] = P(selBox.x1, selBox.y1);
          const W = selBox.x1 - selBox.x0, H = selBox.y1 - selBox.y0;
          return (
            <g pointerEvents="none" fontSize={10.5} fontFamily={MONO} fill={ACCENT}>
              <line x1={x0} y1={y1 + 14} x2={x1} y2={y1 + 14} stroke={ACCENT} markerStart="url(#arrS)" markerEnd="url(#arrE)" />
              <rect x={(x0 + x1) / 2 - 52} y={y1 + 18} width={104} height={14} rx={3} fill="#fff" fillOpacity={0.85} />
              <text x={(x0 + x1) / 2} y={y1 + 29} textAnchor="middle">W {W} px · {(W * k).toFixed(1)} nm</text>
              <line x1={x1 + 14} y1={y0} x2={x1 + 14} y2={y1} stroke={ACCENT} markerStart="url(#arrS)" markerEnd="url(#arrE)" />
              <rect x={x1 + 18} y={(y0 + y1) / 2 - 7} width={104} height={14} rx={3} fill="#fff" fillOpacity={0.85} />
              <text x={x1 + 22} y={(y0 + y1) / 2 + 3.5}>H {H} px · {(H * k).toFixed(1)} nm</text>
            </g>
          );
        })()}

        <defs>
          <pattern id="voidHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="#111" fillOpacity="0.15" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="#111" strokeWidth="2" />
          </pattern>
          <marker id="arrS" markerWidth="6" markerHeight="6" refX="1" refY="3" orient="auto">
            <path d="M6,0 L0,3 L6,6" fill="none" stroke={ACCENT} />
          </marker>
          <marker id="arrE" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6" fill="none" stroke={ACCENT} />
          </marker>
        </defs>

        {ed.box && (() => {
          const [x0, y0] = P(ed.box.x0, ed.box.y0);
          const [x1, y1] = P(ed.box.x1, ed.box.y1);
          return <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} stroke={ACCENT} strokeDasharray="4 3" fill="rgba(31,94,255,.08)" pointerEvents="none" />;
        })()}

        {/* Δ 標籤：px 與 nm */}
        {ed.delta && (() => {
          const d = ed.delta;
          const [cx, cy] = P(d.cur.x, d.cur.y);
          const lines = [
            `Δx ${signed(d.dx)} px (${signed(d.dx * k, 1)} nm)   Δy ${signed(d.dy)} px (${signed(d.dy * k, 1)} nm)`,
            d.normal !== null ? `法向 ${signed(d.normal, 1)} px (${signed(d.normal * k, 1)} nm)` : `位移 ${Math.hypot(d.dx, d.dy).toFixed(1)} px`,
          ];
          const bw = 310, bh = 40;
          const x = Math.min(cx + 14, w - bw - 2), y = Math.max(2, cy - bh - 14);
          return (
            <g pointerEvents="none">
              <rect x={x} y={y} width={bw} height={bh} rx={4} fill="#111827" opacity={0.92} />
              {lines.map((t, i) => <text key={i} x={x + 8} y={y + 16 + i * 15} fontSize={11.5} fill="#fde68a" fontFamily={MONO}>{t}</text>)}
            </g>
          );
        })()}
      </svg>

      {/* 浮動工具列：外框右上 */}
      {floatPos && !ed.dragging && (
        <div className="floatbar" style={floatPos} onPointerDown={(e) => e.stopPropagation()}>
          {handlesSelected ? (
            <>
              <span className="dim">{ed.vertexSel.length ? `${ed.vertexSel.length} 頂點` : `${ed.edgeSel.length} 邊`}</span>
              {ed.edgeSel.length > 0 && (
                <>
                  <input type="number" value={normalPx} step={1} onChange={(e) => setNormalPx(+e.target.value)} title="沿法線位移 px" />
                  <button onClick={() => ed.applyNormalOffset(normalPx)}>法向 {normalPx >= 0 ? '+' : ''}{normalPx} px</button>
                </>
              )}
            </>
          ) : (
            <>
              <span className="dim">{ed.regionSel.length} 區域</span>
              <button onClick={() => ed.setMaterial(VOID_ID)}>設為 VOID</button>
              <button onClick={() => ed.bringToFront()}>移到最上層</button>
            </>
          )}
          <button onClick={() => ed.nudge(0, -1)} title="↑ 1 px">↑</button>
          <button onClick={() => ed.nudge(0, 1)} title="↓ 1 px">↓</button>
          <button onClick={() => ed.nudge(-1, 0)} title="← 1 px">←</button>
          <button onClick={() => ed.nudge(1, 0)} title="→ 1 px">→</button>
        </div>
      )}

      {/* 右鍵材質選單 */}
      {ed.menu && (
        <div className="ctxmenu" style={{ left: Math.min(w - 190, ed.menu.x), top: Math.min(h - 300, ed.menu.y) }} onPointerDown={(e) => e.stopPropagation()}>
          <div className="hd">{model.regions.find((r) => r.id === ed.menu!.region)?.label}　→ 材質</div>
          {ed.materials.map((m) => (
            <button key={m.id} onClick={() => ed.setMaterial(m.id, ed.regionSel.length ? ed.regionSel : [ed.menu!.region])}>
              <span className="sw" style={{ background: m.fill }} />
              {m.name}
            </button>
          ))}
          <div className="sep" />
          <button onClick={() => ed.bringToFront(ed.regionSel.length ? ed.regionSel : [ed.menu!.region])}>移到最上層</button>
        </div>
      )}
    </div>
  );
}
