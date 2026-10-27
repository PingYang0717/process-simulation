import type { Material } from './types';

export const MATERIALS: Material[] = [
  { id: 'si', name: 'Si (p)', fill: '#ddd8cb' },
  { id: 'si_n', name: 'Si n+', fill: '#f3b9a1' },
  { id: 'fin', name: 'Si fin', fill: '#f3b9a1' },
  { id: 'sio2', name: 'SiO₂', fill: '#9fd3e8' },
  { id: 'poly', name: 'Poly-Si', fill: '#e8604c' },
  { id: 'sin', name: 'SiN', fill: '#c9b6e8' },
  { id: 'hfo2', name: 'HfO₂ (high-k)', fill: '#7fc8a9' },
  { id: 'tin', name: 'TiN (metal gate)', fill: '#8e9aaf' },
  { id: 'w', name: 'W (contact)', fill: '#5b6472' },
  { id: 'air', name: 'Air / vacuum', fill: '#ffffff' },
];

export const materialOf = (id: string) => MATERIALS.find((m) => m.id === id) ?? MATERIALS[0];
