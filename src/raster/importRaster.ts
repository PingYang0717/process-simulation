import { chainsToModel, traceChains } from './chains';
import { KNOWN_MATERIALS, fromHex } from './color';
import { components } from './components';
import { quantize } from './quantize';
import type { Imported, Material, RasterImage } from '../model/types';

export const VOID_ID = 'void';

/** PNG（RGBA）→ 調色盤 → 連通元件 → 邊界鏈 → 共用頂點的 Model（nm） */
export function importRaster(img: RasterImage, nmPerPx: number, voidColor = '#000000'): Imported {
  const { palette, index } = quantize(img);
  const { labels, count, colorOf } = components(index, img.width, img.height);
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
  materials.push({ id: VOID_ID, name: 'VOID', fill: voidColor, isVoid: true });
  const chains = traceChains(labels, img.width, img.height);
  const model = chainsToModel(chains, count, colorOf, materials, nmPerPx, img.width, img.height);
  return {
    width: img.width,
    height: img.height,
    original: new Uint8ClampedArray(img.data),
    labels,
    palette,
    materials,
    model,
    nmPerPx,
  };
}

/** 瀏覽器端把圖檔解碼成 RGBA */
export async function decodeImage(file: Blob): Promise<RasterImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return { width: canvas.width, height: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
  } finally {
    URL.revokeObjectURL(url);
  }
}
