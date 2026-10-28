import { useEffect, useMemo, useRef } from 'react';
import type { Imported } from '../model/types';
import type { View } from '../editor/view';

/** compare：左右並排，左邊原圖、右邊輸出（這個元件在 compare 時畫輸出） */
export type Underlay = 'output' | 'original' | 'compare' | 'none';

const toCanvas = (cache: { current: HTMLCanvasElement | null }, img: ImageData) => {
  cache.current ??= document.createElement('canvas');
  const c = cache.current;
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
};

/** 相異區域的外框：遮罩內像素與遮罩外相鄰的那條像素邊（影像座標） */
function diffOutline(mask: Uint8Array, W: number, H: number): Path2D | null {
  const path = new Path2D();
  let any = false;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      any = true;
      if (y === 0 || !mask[(y - 1) * W + x]) { path.moveTo(x, y); path.lineTo(x + 1, y); }
      if (y === H - 1 || !mask[(y + 1) * W + x]) { path.moveTo(x, y + 1); path.lineTo(x + 1, y + 1); }
      if (x === 0 || !mask[y * W + x - 1]) { path.moveTo(x, y); path.lineTo(x, y + 1); }
      if (x === W - 1 || !mask[y * W + x + 1]) { path.moveTo(x + 1, y); path.lineTo(x + 1, y + 1); }
    }
  return any ? path : null;
}

/**
 * 底圖：輸出（預設，顏色就是材質色）、原圖或無；
 * 相異像素畫成紅色外框，不蓋住顏色。依 view 變換、不平滑（放大看得到像素）。
 */
export function RasterUnderlay({ imported, output, diffMask, showDiff, underlay, view, w, h }: {
  imported: Imported; output: Uint8ClampedArray; diffMask: Uint8Array; showDiff: boolean; underlay: Underlay; view: View; w: number; h: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const outC = useRef<HTMLCanvasElement | null>(null);
  const origC = useRef<HTMLCanvasElement | null>(null);
  const { width: W, height: H } = imported;
  const outline = useMemo(() => (showDiff ? diffOutline(diffMask, W, H) : null), [diffMask, showDiff, W, H]);
  const outImg = useMemo(() => toCanvas(outC, new ImageData(new Uint8ClampedArray(output), W, H)), [output, W, H]);
  const origImg = useMemo(() => toCanvas(origC, new ImageData(new Uint8ClampedArray(imported.original), W, H)), [imported, W, H]);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(view.s, 0, 0, view.s, view.tx, view.ty);
    if (underlay === 'output' || underlay === 'compare') ctx.drawImage(outImg, 0, 0);
    if (underlay === 'original') ctx.drawImage(origImg, 0, 0);
    if (outline) {
      ctx.strokeStyle = '#E24B4A';
      ctx.lineWidth = Math.max(1.5, view.s * 0.12) / view.s;
      ctx.stroke(outline);
    }
  }, [underlay, outImg, origImg, outline, view, w, h]);
  return <canvas ref={ref} width={w} height={h} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />;
}
