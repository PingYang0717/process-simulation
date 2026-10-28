import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as RMouseEvent, PointerEvent as RPointerEvent } from 'react';
import type { Editor } from '../editor/useEditor';
import { niceStep, signed } from '../editor/view';
import { bboxOf, pointInPoly, polyOf } from '../model/geometry';
import { materialOf } from '../raster/exportRaster';
import type { XY } from '../model/types';
import { RasterUnderlay } from './RasterUnderlay';
import type { Underlay } from './RasterUnderlay';

const ACCENT = '#1F5EFF';

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

export function SectionCanvas({ ed, underlay, outputData, overlayAlpha }: { ed: Editor; underlay: Underlay; outputData?: Uint8ClampedArray; overlayAlpha: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 600, h: 500 });
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

  const { model, mode, view } = ed;
  const { w, h } = size;
  const nmPerPx = ed.imported.nmPerPx;
  const P = (x: number, y: number): XY => [x * view.s + view.tx, y * view.s + view.ty];
  const nmAt = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.tx) / view.s, y: (e.clientY - r.top - view.ty) / view.s };
  };
  const mods = (e: RPointerEvent) => ({ shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
  const capture = (e: RPointerEvent) => svgRef.current?.setPointerCapture(e.pointerId);
  const isPan = (e: RPointerEvent) => ed.panMode || spaceDown.current || e.button === 1;

  const onBgDown = (e: RPointerEvent) => {
    capture(e);
    if (isPan(e)) {
      pan.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
      return;
    }
    if (e.button === 0) ed.pointerDownBackground(nmAt(e), mods(e));
  };
  const itemDown = (id: string) => (e: RPointerEvent) => {
    if (isPan(e)) { onBgDown(e); return; }
    if (e.button !== 0) return;
    e.stopPropagation();
    capture(e);
    ed.pointerDownItem(id, nmAt(e), mods(e));
  };
  const onMove = (e: RPointerEvent) => {
    if (pan.current) {
      ed.setView({ s: view.s, tx: pan.current.tx + e.clientX - pan.current.x, ty: pan.current.ty + e.clientY - pan.current.y });
      return;
    }
    ed.pointerMove(nmAt(e));
  };
  // 指標被 svg capture 後 dblclick 的 target 是 svg，所以在這裡找游標下的邊
  const onDouble = (e: RMouseEvent<SVGSVGElement>) => {
    if (mode !== 'edge') return;
    const r = svgRef.current!.getBoundingClientRect();
    const [px, py] = [e.clientX - r.left, e.clientY - r.top];
    let best: string | undefined, bd = 6;
    for (const edge of ed.edges) {
      if (!inScope(edge.regions)) continue;
      const [ax, ay] = P(model.vertices[edge.a].x, model.vertices[edge.a].y);
      const [bx, by] = P(model.vertices[edge.b].x, model.vertices[edge.b].y);
      const len2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len2));
      const d = Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
      if (d < bd) { bd = d; best = edge.key; }
    }
    if (best) ed.splitEdgeAt(best, nmAt(e));
  };

  const sel = new Set(ed.selected);
  const scope = new Set(ed.scope);
  const scopeVerts = new Set<string>();
  if (scope.size) model.regions.filter((r) => scope.has(r.id)).forEach((r) => r.loop.forEach((v) => scopeVerts.add(v)));
  const inScope = (regions: string[]) => !scope.size || regions.some((r) => scope.has(r));
  const vertInScope = (id: string) => !scope.size || scopeVerts.has(id);

  const step = niceStep(view.s);
  const gx: number[] = [], gy: number[] = [];
  for (let x = Math.floor(-view.tx / view.s / step) * step; x <= (w - view.tx) / view.s; x += step) gx.push(Math.round(x * 1e6) / 1e6);
  for (let y = Math.floor(-view.ty / view.s / step) * step; y <= (h - view.ty) / view.s; y += step) gy.push(Math.round(y * 1e6) / 1e6);

  return (
    <div ref={wrapRef} className="canvas-wrap" style={{ cursor: ed.panMode ? 'grab' : 'default' }}>
      <RasterUnderlay imported={ed.imported} output={outputData} underlay={underlay} view={view} w={w} h={h} />
      <svg
        ref={svgRef}
        width={w}
        height={h}
        style={{ touchAction: 'none', display: 'block', position: 'relative' }}
        onPointerMove={onMove}
        onPointerUp={() => (pan.current = null)}
        onPointerDown={onBgDown}
        onDoubleClick={onDouble}
        onContextMenu={(e) => e.preventDefault()}
      >
        <rect width={w} height={h} fill={underlay === 'none' ? '#F7F8FA' : 'transparent'} />

        {/* 格線與尺規 */}
        <g pointerEvents="none">
          {gx.map((x) => {
            const [px] = P(x, 0);
            return <line key={'gx' + x} x1={px} y1={0} x2={px} y2={h} stroke={x === 0 ? '#B9C2CC' : '#E2E6EC'} strokeOpacity={underlay === 'none' ? 1 : 0.5} />;
          })}
          {gy.map((y) => {
            const [, py] = P(0, y);
            return <line key={'gy' + y} x1={0} y1={py} x2={w} y2={py} stroke={y === 0 ? '#B9C2CC' : '#E2E6EC'} strokeOpacity={underlay === 'none' ? 1 : 0.5} />;
          })}
          <rect x={0} y={0} width={w} height={16} fill="#EEF1F5" opacity={0.95} />
          <rect x={0} y={0} width={34} height={h} fill="#EEF1F5" opacity={0.95} />
          {gx.map((x) => {
            const [px] = P(x, 0);
            return px > 34 ? <text key={'tx' + x} x={px} y={11} fontSize={9.5} textAnchor="middle" fill="#555">{x}</text> : null;
          })}
          {gy.map((y) => {
            const [, py] = P(0, y);
            return py > 16 ? <text key={'ty' + y} x={31} y={py + 3.5} fontSize={9.5} textAnchor="end" fill="#555">{y}</text> : null;
          })}
          <text x={2} y={11} fontSize={9} fill="#888">nm</text>
        </g>

        {/* 區域 */}
        {model.regions.map((r) => {
          const isSel = mode === 'region' && sel.has(r.id);
          const isScope = mode !== 'region' && scope.has(r.id);
          const mat = ed.materials.find((m) => m.id === r.material);
          const d = [r.loop, ...(r.holes ?? [])]
            .map((ring) => 'M' + ring.map((v) => P(model.vertices[v].x, model.vertices[v].y).join(',')).join('L') + 'Z')
            .join(' ');
          return (
            <path
              key={r.id}
              d={d}
              fillRule="evenodd"
              fill={mat?.isVoid ? 'url(#voidHatch)' : materialOf(ed.materials, r.material).fill}
              fillOpacity={mat?.isVoid ? 0.9 : overlayAlpha}
              opacity={mode !== 'region' && scope.size && !scope.has(r.id) ? 0.45 : 1}
              stroke={isSel || isScope ? ACCENT : '#4b4b4b'}
              strokeWidth={isSel ? 3 : isScope ? 2 : 1}
              strokeDasharray={isScope ? '5 3' : undefined}
              strokeLinejoin="round"
              className={mode === 'region' ? 'hit' : ''}
              style={{ cursor: ed.panMode ? 'grab' : mode === 'region' ? 'move' : 'default' }}
              pointerEvents={mode === 'region' ? 'auto' : 'none'}
              onPointerDown={itemDown(r.id)}
            />
          );
        })}

        {/* 區域標籤 */}
        <g pointerEvents="none">
          {model.regions.map((r) => {
            const at = labelAnchor(polyOf(model, r), (r.label.length * 7 + 8) / view.s, 16 / view.s);
            if (!at) return null;
            const [x, y] = P(...at);
            return <text key={r.id} x={x} y={y + 3.5} fontSize={10.5} textAnchor="middle" fill="#222">{r.label}</text>;
          })}
        </g>

        {/* 邊 */}
        {ed.edges.map((e) => {
          if (mode === 'edge' && !inScope(e.regions)) return null;
          const a = model.vertices[e.a], b = model.vertices[e.b];
          const [x1, y1] = P(a.x, a.y), [x2, y2] = P(b.x, b.y);
          const isSel = mode === 'edge' && sel.has(e.key);
          return (
            <g key={e.key}>
              {isSel && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={ACCENT} strokeWidth={4} strokeLinecap="round" pointerEvents="none" />}
              {mode === 'edge' && (
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={12} strokeLinecap="round" className="hit" style={{ cursor: 'move' }} onPointerDown={itemDown(e.key)} />
              )}
            </g>
          );
        })}

        {/* 頂點：頂點模式顯示範圍內全部；其他模式只顯示會被拖動的 */}
        {Object.values(model.vertices).map((v) => {
          if (!((mode === 'vertex' && vertInScope(v.id)) || ed.movingVertices.has(v.id))) return null;
          const [x, y] = P(v.x, v.y);
          const on = mode === 'vertex' ? sel.has(v.id) : ed.movingVertices.has(v.id);
          return (
            <circle
              key={v.id}
              cx={x}
              cy={y}
              r={mode === 'vertex' ? 5 : 3.5}
              fill={on ? ACCENT : '#fff'}
              stroke={ACCENT}
              strokeWidth={1.5}
              className={mode === 'vertex' ? 'hit' : ''}
              style={{ cursor: mode === 'vertex' ? 'move' : 'default' }}
              pointerEvents={mode === 'vertex' ? 'auto' : 'none'}
              onPointerDown={itemDown(v.id)}
            />
          );
        })}

        {/* 已選區域的 W/H 尺寸線 */}
        {mode === 'region' && ed.selected.length > 0 && (() => {
          const b = bboxOf(model.regions.filter((r) => sel.has(r.id)).flatMap((r) => polyOf(model, r)));
          const [x0, y0] = P(b.x0, b.y0), [x1, y1] = P(b.x1, b.y1);
          return (
            <g pointerEvents="none" fontSize={10.5} fontFamily="ui-monospace, Menlo, monospace" fill={ACCENT}>
              <line x1={x0} y1={y1 + 14} x2={x1} y2={y1 + 14} stroke={ACCENT} markerStart="url(#arrS)" markerEnd="url(#arrE)" />
              <rect x={(x0 + x1) / 2 - 44} y={y1 + 18} width={88} height={14} rx={3} fill="#fff" fillOpacity={0.85} />
              <text x={(x0 + x1) / 2} y={y1 + 29} textAnchor="middle">W {(b.x1 - b.x0).toFixed(1)} nm</text>
              <line x1={x1 + 14} y1={y0} x2={x1 + 14} y2={y1} stroke={ACCENT} markerStart="url(#arrS)" markerEnd="url(#arrE)" />
              <rect x={x1 + 18} y={(y0 + y1) / 2 - 7} width={88} height={14} rx={3} fill="#fff" fillOpacity={0.85} />
              <text x={x1 + 22} y={(y0 + y1) / 2 + 3.5}>H {(b.y1 - b.y0).toFixed(1)} nm</text>
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

        {/* 框選 */}
        {ed.box && (() => {
          const [x0, y0] = P(ed.box.x0, ed.box.y0), [x1, y1] = P(ed.box.x1, ed.box.y1);
          return <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} stroke={ACCENT} strokeDasharray="4 3" fill="rgba(29,78,216,.08)" pointerEvents="none" />;
        })()}

        {/* Δ 浮動標籤：nm 與影像 px */}
        {ed.delta && (() => {
          const d = ed.delta;
          const [cx, cy] = P(d.cur.x, d.cur.y);
          const lines = [
            `Δx ${signed(d.dx)} nm (${signed(d.dx / nmPerPx)} px)   Δy ${signed(d.dy)} nm (${signed(d.dy / nmPerPx)} px)`,
            d.normal !== null ? `法向位移 ${signed(d.normal)} nm` : `位移量 ${d.dist.toFixed(1)} nm`,
          ];
          const bw = 300, bh = 40;
          const x = Math.min(cx + 14, w - bw - 2), y = Math.max(2, cy - bh - 14);
          return (
            <g pointerEvents="none">
              <rect x={x} y={y} width={bw} height={bh} rx={4} fill="#111827" opacity={0.92} />
              {lines.map((t, i) => (
                <text key={i} x={x + 8} y={y + 16 + i * 15} fontSize={11.5} fill="#fde68a" fontFamily="ui-monospace, Menlo, monospace">{t}</text>
              ))}
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
