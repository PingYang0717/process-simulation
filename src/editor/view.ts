import type { World, XY } from '../model/types';

/** px = nm × s + t */
export interface View { s: number; tx: number; ty: number }
export interface Size { w: number; h: number }

export const MIN_S = 0.3;
export const MAX_S = 60;

export function fit(world: World, size: Size, pad = 48): View {
  const ww = world.x1 - world.x0 || 1, wh = world.yBot - world.yTop || 1;
  const s = Math.max(MIN_S, Math.min(MAX_S, Math.min((size.w - 2 * pad) / ww, (size.h - 2 * pad) / wh)));
  return { s, tx: (size.w - ww * s) / 2 - world.x0 * s, ty: (size.h - wh * s) / 2 - world.yTop * s };
}

export function zoomAt(v: View, s: number, [px, py]: XY): View {
  const ns = Math.max(MIN_S, Math.min(MAX_S, s));
  const nx = (px - v.tx) / v.s, ny = (py - v.ty) / v.s;
  return { s: ns, tx: px - nx * ns, ty: py - ny * ns };
}

export const toNm = (v: View, [px, py]: XY): XY => [(px - v.tx) / v.s, (py - v.ty) / v.s];
export const toPx = (v: View, [x, y]: XY): XY => [x * v.s + v.tx, y * v.s + v.ty];

/** 取 1/2/5×10ⁿ 中，換成 px 最接近 targetPx 的 nm 值 */
export function niceStep(pxPerNm: number, targetPx = 70): number {
  const raw = targetPx / pxPerNm;
  const e = Math.floor(Math.log10(raw));
  let best = 1, bd = Infinity;
  for (const m of [1, 2, 5, 10]) {
    const c = m * 10 ** e;
    const d = Math.abs(Math.log(c / raw));
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
