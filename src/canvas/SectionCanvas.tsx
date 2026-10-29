import { CompressOutlined, DeleteOutlined, DragOutlined, MinusOutlined, MoreOutlined, PlusCircleOutlined, PlusOutlined, VerticalAlignTopOutlined, VerticalAlignBottomOutlined } from '@ant-design/icons';
import { Button, Divider, Dropdown, Menu, Tooltip, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import type { Editor } from '../editor/useEditor';
import { niceStep, signed } from '../editor/view';
import { isCorner } from '../model/drag';
import { bboxOf, pointInPoly, polyOf, ringsOf } from '../model/geometry';
import type { XY } from '../model/types';
import type { ExportResult } from '../raster/exportRaster';
import { exactRing, materialOf, segmentPts } from '../raster/exportRaster';
import { VOID_ID } from '../raster/importRaster';
import { MoveForm, PushForm } from '../ui/MoveForm';
import { Swatch } from '../ui/Swatch';
import { RasterUnderlay } from './RasterUnderlay';
import type { Underlay } from './RasterUnderlay';

const ACCENT = '#1677ff';
const HOVER = '#fa8c16';
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

/** 手形（antd 圖示集沒有） */
const HandIcon = () => (
  <span className="anticon" aria-hidden="true">
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11.5v-7a1.5 1.5 0 0 1 3 0V12M14 6.5a1.5 1.5 0 0 1 3 0V12M17 9.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1.5a7 7 0 0 1-5.6-2.8L3.4 15.7a1.6 1.6 0 0 1 2.4-2.1L8 15.5" />
    </svg>
  </span>
);

/** 浮在畫布上的小面板（移動／往外推），位置為畫布內座標 */
type Panel = { kind: 'move' | 'push'; x: number; y: number };

export function SectionCanvas({ ed, underlay, result, overlayAlpha, showDiff, showLabels }: {
  ed: Editor; underlay: Underlay; result: ExportResult; overlayAlpha: number; showDiff: boolean; showLabels: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 600, h: 500 });
  const [cursorPt, setCursorPt] = useState<XY | null>(null); // 前後比對時，左邊原圖上同步的十字
  const [peek, setPeek] = useState(false); // 按住 B 暫時看原圖
  const [panel, setPanel] = useState<Panel | null>(null);
  const [outside, setOutside] = useState(false); // 游標在圖片外：可以拖曳移動畫面
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const spaceDown = useRef(false);

  useEffect(() => {
    if (!wrapRef.current) return;
    let first = true; // 第一次量到真正尺寸時一定置中
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.floor(entry.contentRect.width), h = Math.floor(entry.contentRect.height);
      setSize({ w, h });
      ed.setCanvasSize(w, h, first);
      first = false;
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [ed.setCanvasSize]);

  // React 的 onWheel 擋不住頁面捲動，手動掛 passive:false。
  // 觸控板雙指捲動 = 平移；捏合或 Ctrl／⌘+滾輪 = 縮放；一般滑鼠滾輪 = 縮放（Shift 改成水平平移）
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const mouseWheel = e.deltaMode !== 0 || (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40);
      if (e.ctrlKey || e.metaKey || (mouseWheel && !e.shiftKey)) ed.zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
      else if (mouseWheel) ed.panBy(-e.deltaY, 0);
      else ed.panBy(-e.deltaX, -e.deltaY);
    };
    svg.addEventListener('wheel', h, { passive: false });
    return () => svg.removeEventListener('wheel', h);
  }, [ed.zoomAt, ed.panBy]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.matches?.('input,select,textarea')) return;
      if (e.code === 'Space') {
        spaceDown.current = true;
        e.preventDefault();
      }
      if (e.key.toLowerCase() === 'b' && !e.ctrlKey && !e.metaKey) setPeek(true);
      if (e.key === 'Escape') setPanel(null);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDown.current = false;
      if (e.key.toLowerCase() === 'b') setPeek(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // 選取清空時收起面板
  const anySel = ed.regionSel.length + ed.edgeSel.length + ed.vertexSel.length > 0;
  useEffect(() => {
    if (!anySel) setPanel(null);
  }, [anySel]);

  const { model, view, hover } = ed;
  const { w, h } = size;
  const k = ed.nmPerPx;
  // 畫面輪廓與輸出同一規則：沒拖到的段沿用原始像素輪廓，所以藍線會貼著像素邊
  const shapes = useMemo(
    () => new Map(model.regions.map((r) => [r.id, ringsOf(r).map((ring) => exactRing(model, ed.imported, ring))])),
    [model, ed.imported],
  );
  const P = (x: number, y: number): XY => [x * view.s + view.tx, y * view.s + view.ty];
  const pxAt = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.tx) / view.s, y: (e.clientY - r.top - view.ty) / view.s };
  };
  const local = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  /** 平移：手形模式、按住空白鍵、中鍵，或在圖片外面按住拖 */
  const isPan = (e: RPointerEvent) => {
    if (ed.panMode || spaceDown.current || e.button === 1) return true;
    if (e.button !== 0) return false;
    const at = pxAt(e), wd = model.world;
    return (at.x < wd.x0 || at.x > wd.x1 || at.y < wd.yTop || at.y > wd.yBot) && ed.hitTest(at).kind === 'none';
  };

  const onDown = (e: RPointerEvent) => {
    svgRef.current?.setPointerCapture(e.pointerId);
    setPanel(null);
    if (isPan(e)) {
      pan.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
      return;
    }
    if (e.button === 2) {
      const p = local(e);
      ed.openMenu(ed.hitTest(pxAt(e)), p.x, p.y);
      return;
    }
    if (e.button === 0) ed.pointerDown(pxAt(e), { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey });
  };
  const onMove = (e: RPointerEvent) => {
    if (pan.current) {
      ed.setView({ s: view.s, tx: pan.current.tx + e.clientX - pan.current.x, ty: pan.current.ty + e.clientY - pan.current.y });
      return;
    }
    const at = pxAt(e);
    const wd = model.world;
    setOutside(at.x < wd.x0 || at.x > wd.x1 || at.y < wd.yTop || at.y > wd.yBot);
    if (underlay === 'compare') setCursorPt([at.x, at.y]);
    ed.pointerMove(at);
  };

  // 游標：節點 → 十字、邊 → 垂直於邊的雙箭頭、區域 → 四箭頭
  const cursor = ed.panMode || pan.current || (outside && hover.kind === 'none') ? 'grab'
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
  const handlesSelected = ed.edgeSel.length > 0 || ed.vertexSel.length > 0;
  // 浮動工具列：已選外框右上；靠近右緣時改貼齊右邊
  const barPos = selBox
    ? (() => {
      const [x, y] = P(selBox.x1, selBox.y0);
      const top = Math.max(8, Math.min(h - 48, y - 52));
      return x + 12 + 400 > w ? { right: 12, top } : { left: Math.max(8, x + 12), top };
    })()
    : null;

  const barX = barPos?.left ?? w - 412;
  // 節點：只畫已選或游標所在區域的節點；角畫方塊、其他畫圓點；按住 V 顯示全部輪廓點
  const handles = new Map<string, boolean>();
  for (const r of model.regions) {
    if (!ed.activeIds.has(r.id)) continue;
    for (const ring of ringsOf(r))
      ring.forEach((id, i) => {
        if (handles.has(id) || (ed.hold !== 'V' && !ed.handleSet.has(id))) return;
        handles.set(id, isCorner(model, ring, i));
      });
  }

  const sel = ed.regionSel;
  const curMat = sel.length ? materialOf(ed.materials, model.regions.find((r) => r.id === sel[0])!.material) : null;
  const materialItems: MenuProps['items'] = ed.materials.map((m) => ({
    key: m.id,
    label: m.name,
    icon: <span className="anticon"><Swatch fill={m.fill} isVoid={m.isVoid} /></span>,
    onClick: () => ed.setMaterial(m.id),
  }));
  const openPanel = (kind: Panel['kind'], x: number, y: number) => {
    ed.setMenu(null);
    setPanel({ kind, x: Math.min(w - 300, Math.max(8, x)), y: Math.min(h - 220, Math.max(8, y)) });
  };

  // 右鍵選單：依點到的東西給不同項目
  const menuItems: MenuProps['items'] = (() => {
    const m = ed.menu;
    if (!m) return [];
    const move = { key: 'move', icon: <DragOutlined />, label: '移動到…', onClick: () => openPanel('move', m.x, m.y) };
    const mat = { key: 'mat', icon: curMat ? <span className="anticon"><Swatch fill={curMat.fill} isVoid={curMat.isVoid} /></span> : undefined, label: '換材質', children: materialItems };
    const toVoid = { key: 'void', label: '設為 VOID', onClick: () => ed.setMaterial(VOID_ID) };
    if (m.kind === 'vertex')
      return [move, { key: 'del', icon: <DeleteOutlined />, danger: true, label: '刪除節點（Delete）', onClick: () => { ed.deleteNodes(); ed.setMenu(null); } }, { type: 'divider' }, mat, toVoid];
    if (m.kind === 'edge')
      return [
        { key: 'push', icon: <CompressOutlined />, label: '往外推…', onClick: () => openPanel('push', m.x, m.y) },
        move,
        { key: 'add', icon: <PlusCircleOutlined />, label: '在這裡新增節點', onClick: () => { ed.addNodeAt({ x: (m.x - view.tx) / view.s, y: (m.y - view.ty) / view.s }); ed.setMenu(null); } },
        { type: 'divider' },
        mat,
      ];
    return [
      move, mat, toVoid, { type: 'divider' },
      { key: 'front', icon: <VerticalAlignTopOutlined />, label: '移到最上層', onClick: () => ed.bringToFront() },
      { key: 'back', icon: <VerticalAlignBottomOutlined />, label: '移到最下層', onClick: () => ed.sendToBack() },
    ];
  })();
  const menuTitle = ed.menu ? `${model.regions.find((r) => r.id === ed.menu!.region)?.label ?? ''}${ed.menu.kind === 'vertex' ? ' · 節點' : ed.menu.kind === 'edge' ? ' · 邊' : ''}` : '';

  const hint = ed.delta
    ? `Δx ${signed(ed.delta.dx)} px、Δy ${signed(ed.delta.dy)} px${ed.followInfo.layers ? `｜外面 ${ed.followInfo.layers} 層一起推` : ''}${ed.followInfo.blocked ? '｜已停住（再推會穿過旁邊的層）' : ''}`
    : ed.hold === 'V' ? '顯示全部輪廓點（放開 V 回到節點）'
    : ed.panMode ? '拖曳移動畫面（按 H 或 Esc 結束）'
    : '拖曳區域搬移 · 拖曳邊推移 · 雙擊邊新增節點 · 右鍵更多 · 圖片外拖曳可移動畫面';

  return (
    <div className="canvas-area">
      {underlay === 'compare' && <OriginalPane ed={ed} diffMask={result.diffMask} showDiff={showDiff} cursorPt={cursorPt} />}
      <div className="pane">
        {underlay === 'compare' && (
          <div className="pane-head"><b>改動後</b><Typography.Text style={{ color: ACCENT, fontSize: 12 }}>編輯中</Typography.Text></div>
        )}
        <div ref={wrapRef} className={'canvas-wrap' + (underlay === 'compare' ? ' editing' : '')} style={{ cursor }} onPointerLeave={() => setCursorPt(null)}>
          <RasterUnderlay imported={ed.imported} output={result.data} diffMask={result.diffMask} showDiff={showDiff} underlay={peek ? 'original' : underlay} view={view} w={w} h={h} />
          <svg
            ref={svgRef}
            width={w}
            height={h}
            style={{ touchAction: 'none', display: 'block', position: 'relative' }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={() => (pan.current = null)}
            onDoubleClick={(e) => ed.addNodeAt(pxAt(e))}
            onContextMenu={(e) => e.preventDefault()}
          >
            {/* 尺規（nm） */}
            <g pointerEvents="none">
              {gx.map((x) => {
                const [px] = P(x, 0);
                return <line key={'gx' + x} x1={px} y1={0} x2={px} y2={h} stroke="#000" strokeOpacity={0.05} />;
              })}
              {gy.map((y) => {
                const [, py] = P(0, y);
                return <line key={'gy' + y} x1={0} y1={py} x2={w} y2={py} stroke="#000" strokeOpacity={0.05} />;
              })}
              <rect x={0} y={0} width={w} height={18} fill="#fafafa" />
              <rect x={0} y={0} width={36} height={h} fill="#fafafa" />
              <line x1={0} y1={18} x2={w} y2={18} stroke="#f0f0f0" />
              <line x1={36} y1={0} x2={36} y2={h} stroke="#f0f0f0" />
              {gx.map((x) => {
                const [px] = P(x, 0);
                return px > 40 ? <text key={'tx' + x} x={px} y={13} fontSize={10} textAnchor="middle" fill="#8c8c8c">{nmLabel(x)}</text> : null;
              })}
              {gy.map((y) => {
                const [, py] = P(0, y);
                return py > 24 ? <text key={'ty' + y} x={32} y={py + 3.5} fontSize={10} textAnchor="end" fill="#8c8c8c">{nmLabel(y)}</text> : null;
              })}
              <text x={6} y={13} fontSize={10} fill="#8c8c8c">nm</text>
            </g>

            {/* 區域 */}
            {model.regions.map((r) => {
              const isSel = regionSel.has(r.id), hov = hoverRegion === r.id, act = ed.activeIds.has(r.id);
              const mat = materialOf(ed.materials, r.material);
              const d = shapes.get(r.id)!.map((ring) => 'M' + ring.map(([x, y]) => P(x, y).join(',')).join('L') + 'Z').join(' ');
              return (
                <path
                  key={r.id}
                  d={d}
                  fillRule="evenodd"
                  fill={mat.isVoid ? 'url(#voidHatch)' : mat.fill}
                  fillOpacity={mat.isVoid ? 0.9 : hov ? Math.min(1, overlayAlpha + 0.2) : overlayAlpha}
                  stroke={isSel ? ACCENT : act ? '#69b1ff' : '#595959'}
                  strokeOpacity={isSel || act ? 1 : 0.6}
                  strokeWidth={isSel ? 2 : act ? 1.5 : 0.8}
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
                  return <text key={r.id} x={x} y={y + 3.5} fontSize={11} textAnchor="middle" fill="#1f1f1f">{r.label}</text>;
                })}
              </g>
            )}

            {/* 節點與邊：只在已選或游標所在的區域 */}
            <g pointerEvents="none">
              {ed.edges.filter((e) => e.regions.some((r) => ed.activeIds.has(r))).map((e) => {
                const on = edgeSel.has(e.key), hov = hoverEdges.has(e.key);
                if (!on && !hov) return null;
                const pts = [...segmentPts(model, ed.imported, e.a, e.b), [model.vertices[e.b].x, model.vertices[e.b].y] as XY];
                return <polyline key={e.key} points={pts.map(([x, y]) => P(x, y).join(',')).join(' ')} fill="none" stroke={on ? ACCENT : HOVER} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />;
              })}
              {[...handles].map(([id, corner]) => {
                const v = model.vertices[id];
                const [cx, cy] = P(v.x, v.y);
                const on = vertexSel.has(id), hov = hoverVertex === id;
                const r = (corner ? 4 : 3.5) + (hov ? 1.5 : on ? 1 : 0);
                const fill = on ? ACCENT : hov ? HOVER : '#fff';
                return corner
                  ? <rect key={id} x={cx - r} y={cy - r} width={2 * r} height={2 * r} rx={1} fill={fill} stroke={ACCENT} strokeWidth={1.5} />
                  : <circle key={id} cx={cx} cy={cy} r={r} fill={fill} stroke={on ? '#fff' : ACCENT} strokeWidth={1.5} />;
              })}
            </g>

            {/* 已選區域外框尺寸 */}
            {selBox && !handlesSelected && !ed.dragging && (() => {
              const [x0, y0] = P(selBox.x0, selBox.y0);
              const [x1, y1] = P(selBox.x1, selBox.y1);
              const W = selBox.x1 - selBox.x0, H = selBox.y1 - selBox.y0;
              const chip = (x: number, y: number, text: string, anchor: 'middle' | 'start') => (
                <g>
                  <rect x={anchor === 'middle' ? x - 34 : x} y={y - 10} width={68} height={18} rx={4} fill={ACCENT} />
                  <text x={anchor === 'middle' ? x : x + 34} y={y + 3} textAnchor="middle" fill="#fff">{text}</text>
                </g>
              );
              return (
                <g pointerEvents="none" fontSize={11} fontFamily={MONO}>
                  <line x1={x0} y1={y1 + 12} x2={x1} y2={y1 + 12} stroke={ACCENT} />
                  <line x1={x0} y1={y1 + 8} x2={x0} y2={y1 + 16} stroke={ACCENT} />
                  <line x1={x1} y1={y1 + 8} x2={x1} y2={y1 + 16} stroke={ACCENT} />
                  <line x1={x1 + 12} y1={y0} x2={x1 + 12} y2={y1} stroke={ACCENT} />
                  <line x1={x1 + 8} y1={y0} x2={x1 + 16} y2={y0} stroke={ACCENT} />
                  <line x1={x1 + 8} y1={y1} x2={x1 + 16} y2={y1} stroke={ACCENT} />
                  {chip((x0 + x1) / 2, y1 + 28, `W ${W} px`, 'middle')}
                  {chip(x1 + 20, (y0 + y1) / 2, `H ${H} px`, 'start')}
                </g>
              );
            })()}

            <defs>
              <pattern id="voidHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="8" height="8" fill="#000" fillOpacity="0.15" />
                <line x1="0" y1="0" x2="0" y2="8" stroke="#000" strokeWidth="2" />
              </pattern>
            </defs>

            {ed.box && (() => {
              const [x0, y0] = P(ed.box.x0, ed.box.y0);
              const [x1, y1] = P(ed.box.x1, ed.box.y1);
              return <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} stroke={ACCENT} strokeDasharray="4 3" fill="rgba(22,119,255,.08)" pointerEvents="none" />;
            })()}

            {/* 拖拉中的位移標籤 */}
            {ed.delta && (() => {
              const d = ed.delta;
              const [cx, cy] = P(d.cur.x, d.cur.y);
              const text = `${signed(d.dx)}, ${signed(d.dy)} px（${signed(d.dx * k, 1)}, ${signed(d.dy * k, 1)} nm）`;
              const bw = text.length * 6.6 + 16;
              const x = Math.min(cx + 14, w - bw - 4), y = Math.max(22, cy - 36);
              return (
                <g pointerEvents="none">
                  <rect x={x} y={y} width={bw} height={24} rx={6} fill="rgba(0,0,0,.85)" />
                  <text x={x + 8} y={y + 16} fontSize={12} fill="#fff" fontFamily={MONO}>{text}</text>
                </g>
              );
            })()}
          </svg>

          {/* 浮動工具列 */}
          {barPos && !ed.dragging && !ed.menu && !panel && (
            <div className="floatbar" style={barPos} onPointerDown={(e) => e.stopPropagation()}>
              {ed.vertexSel.length > 0 ? (
                <>
                  <span className="fb-label">{ed.vertexSel.length} 個節點</span>
                  <Button type="text" size="small" icon={<DragOutlined />} onClick={() => openPanel('move', barX, barPos.top + 40)}>移動…</Button>
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={ed.deleteNodes}>刪除節點</Button>
                </>
              ) : ed.edgeSel.length > 0 ? (
                <>
                  <span className="fb-label">{ed.edgeSel.length} 段邊</span>
                  <Button type="text" size="small" icon={<CompressOutlined />} onClick={() => openPanel('push', barX, barPos.top + 40)}>往外推…</Button>
                  <Button type="text" size="small" icon={<DragOutlined />} onClick={() => openPanel('move', barX, barPos.top + 40)}>移動…</Button>
                </>
              ) : (
                <>
                  {sel.length > 1 && <span className="fb-label">{sel.length} 個區域</span>}
                  <Dropdown menu={{ items: materialItems }} trigger={['click']}>
                    <Button type="text" size="small">
                      {curMat && <Swatch fill={curMat.fill} isVoid={curMat.isVoid} />}
                      {curMat?.name}
                    </Button>
                  </Dropdown>
                  <Divider type="vertical" style={{ margin: 0 }} />
                  <Button type="text" size="small" onClick={() => ed.setMaterial(VOID_ID)}>設為 VOID</Button>
                  <Button type="text" size="small" icon={<DragOutlined />} onClick={() => openPanel('move', barX, barPos.top + 40)}>移動…</Button>
                  <Dropdown
                    trigger={['click']}
                    menu={{ items: [
                      { key: 'front', icon: <VerticalAlignTopOutlined />, label: '移到最上層', onClick: () => ed.bringToFront() },
                      { key: 'back', icon: <VerticalAlignBottomOutlined />, label: '移到最下層', onClick: () => ed.sendToBack() },
                    ] }}
                  >
                    <Button type="text" size="small" icon={<MoreOutlined />} aria-label="更多" />
                  </Dropdown>
                </>
              )}
            </div>
          )}

          {/* 右鍵選單 */}
          {ed.menu && (
            <div className="ctxmenu" style={{ left: Math.min(w - 230, ed.menu.x), top: Math.min(h - 320, ed.menu.y) }} onPointerDown={(e) => e.stopPropagation()}>
              <div className="ctx-title">{menuTitle}</div>
              <Menu items={menuItems} selectable={false} style={{ border: 0, minWidth: 220 }} />
            </div>
          )}

          {/* 移動／往外推面板 */}
          {panel && (
            <div className="popcard" style={{ left: panel.x, top: panel.y }} onPointerDown={(e) => e.stopPropagation()}>
              <div className="popcard-head">
                <b>{panel.kind === 'push' ? '往外推' : ed.vertexSel.length ? '移動節點' : ed.edgeSel.length ? '移動邊' : '移動區域'}</b>
                <Button type="text" size="small" onClick={() => setPanel(null)} aria-label="關閉">✕</Button>
              </div>
              {panel.kind === 'push' ? <PushForm ed={ed} onDone={() => setPanel(null)} /> : <MoveForm ed={ed} applyLabel="套用" onDone={() => setPanel(null)} />}
            </div>
          )}

          {peek && <div className="peek">原圖（放開 B 回到輸出）</div>}

          {(underlay !== 'compare' || ed.delta) && <div className={'hintbar' + (ed.delta ? ' hot' : '')}>{hint}</div>}

          <div className="zoombar" onPointerDown={(e) => e.stopPropagation()}>
            <Tooltip title="縮小（−）"><Button type="text" size="small" icon={<MinusOutlined />} onClick={() => ed.zoomAt(0.8)} aria-label="縮小" /></Tooltip>
            <span className="zoom-val">{Math.round(view.s * 100)}%</span>
            <Tooltip title="放大（+）"><Button type="text" size="small" icon={<PlusOutlined />} onClick={() => ed.zoomAt(1.25)} aria-label="放大" /></Tooltip>
            <Divider type="vertical" style={{ margin: '0 4px' }} />
            <Tooltip title="看整張圖（F）"><Button type="text" size="small" onClick={() => ed.fit()}>適合視窗</Button></Tooltip>
            <Button type="text" size="small" onClick={() => ed.setZoom(1)}>1:1</Button>
            <Divider type="vertical" style={{ margin: '0 4px' }} />
            <Tooltip title="拖曳畫面（H）；也可以在圖片外面按住拖、按住空白鍵拖，或用觸控板雙指移動">
              <Button type={ed.panMode ? 'primary' : 'text'} size="small" icon={<HandIcon />} onClick={() => ed.setPanMode(!ed.panMode)} aria-label="拖曳畫面" />
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 前後比對左半邊：原圖（不可編輯），與右邊同一個縮放平移，游標位置畫十字對照 */
function OriginalPane({ ed, diffMask, showDiff, cursorPt }: { ed: Editor; diffMask: Uint8Array; showDiff: boolean; cursorPt: XY | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 500 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: Math.floor(entry.contentRect.width), h: Math.floor(entry.contentRect.height) }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const { view } = ed;
  const c = cursorPt && [cursorPt[0] * view.s + view.tx, cursorPt[1] * view.s + view.ty];
  return (
    <div className="pane">
      <div className="pane-head"><b>原圖</b><Typography.Text type="secondary" style={{ fontSize: 12 }}>只能看</Typography.Text></div>
      <div ref={ref} className="canvas-wrap readonly">
        <RasterUnderlay imported={ed.imported} output={ed.imported.original} diffMask={diffMask} showDiff={showDiff} underlay="original" view={view} w={size.w} h={size.h} />
        {c && (
          <svg width={size.w} height={size.h} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            <line x1={c[0]} y1={0} x2={c[0]} y2={size.h} stroke="#000" strokeOpacity={0.45} strokeDasharray="4 3" />
            <line x1={0} y1={c[1]} x2={size.w} y2={c[1]} stroke="#000" strokeOpacity={0.45} strokeDasharray="4 3" />
            <circle cx={c[0]} cy={c[1]} r={5} fill="none" stroke="#000" strokeWidth={1.5} />
          </svg>
        )}
      </div>
    </div>
  );
}
