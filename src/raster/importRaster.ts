import { chainsToModel, traceChains } from './chains';
import { KNOWN_MATERIALS, fromHex } from './color';
import { components } from './components';
import { quantize } from './quantize';
import type { Imported, Material, RasterImage } from '../model/types';

export const VOID_ID = 'void';

export interface ImportOptions { voidColor?: string; minPx?: number }

/** PNG（RGBA）→ 調色盤 → 連通元件 → 邊界鏈 → 共用頂點的 Model（px） */
export function importRaster(img: RasterImage, nmPerPx: number, opts: ImportOptions = {}): Imported {
  const { palette, index } = quantize(img);
  const { labels, count, colorOf, merged } = components(index, img.width, img.height, opts.minPx ?? 12);
  const materials: Material[] = palette.map((hex, i) => {
    const [r, g, b] = fromHex(hex);
    let best = KNOWN_MATERIALS[0], bd = Infinity;
    for (const k of KNOWN_MATERIALS) {
      const [kr, kg, kb] = fromHex(k.fill);
      const d = (kr - r) ** 2 + (kg - g) ** 2 + (kb - b) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    return { id: `m${i}`, name: bd < 900 * 3 ? best.name : `色塊 ${hex}`, fill: hex };
  });
  materials.push({ id: VOID_ID, name: 'VOID', fill: opts.voidColor ?? '#000000', isVoid: true });
  const chains = traceChains(labels, img.width, img.height);
  const { model, exact } = chainsToModel(chains, count, colorOf, materials, img.width, img.height);
  return {
    width: img.width,
    height: img.height,
    original: new Uint8ClampedArray(img.data),
    labels,
    labelMaterial: colorOf.map((c) => materials[c].id),
    palette,
    materials,
    model,
    exact,
    merged,
    nmPerPx,
  };
}

/** 瀏覽器端把圖檔解碼成 RGBA；關閉色彩管理，像素值與檔案內完全相同 */
export async function decodeImage(file: Blob): Promise<RasterImage> {
  const bmp = await createImageBitmap(file, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return { width: canvas.width, height: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
}
