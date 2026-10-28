export type RGB = [number, number, number];

export const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
export const fromHex = (hex: string): RGB => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** 已知色票表：調色盤顏色以最近色對上材質名稱 */
export const KNOWN_MATERIALS: { name: string; fill: string }[] = [
  { name: 'Si (p)', fill: '#ddd8cb' },
  { name: 'Si n+', fill: '#f3b9a1' },
  { name: 'SiO₂', fill: '#9fd3e8' },
  { name: 'ILD', fill: '#cfe6f2' },
  { name: 'Poly-Si', fill: '#e8604c' },
  { name: 'TiN', fill: '#8e9aaf' },
  { name: 'HfO₂', fill: '#7fc8a9' },
  { name: 'SiN', fill: '#c9b6e8' },
  { name: 'W', fill: '#5b6472' },
  { name: 'Air', fill: '#ffffff' },
];
