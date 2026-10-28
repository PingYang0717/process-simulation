/** px = nm × s + t */
export interface View { s: number; tx: number; ty: number }
export interface Size { w: number; h: number }

export const MIN_S = 0.3;
export const MAX_S = 60;

/** 取 1/2/5×10ⁿ 中，換成 px 最接近 targetPx 的 nm 值 */
export function niceStep(pxPerNm: number, targetPx = 70): number {
  const raw = targetPx / pxPerNm;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

/** 帶正負號、一位小數；0 顯示 ± */
export const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(1)}`;
