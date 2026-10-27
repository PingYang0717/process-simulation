import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export const fmt = (v: number) => (Math.abs(v) < 0.05 ? '0.0' : v.toFixed(1));

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="sec">
      <h3>
        {title}
        {right && <span className="right">{right}</span>}
      </h3>
      {children}
    </section>
  );
}

/** 數值輸入：Enter 或失焦才送出 */
export function NumField({ label, value, onChange, step = 1, width }: { label: string; value: number; onChange: (v: number) => void; step?: number; width?: number }) {
  const [text, setText] = useState(fmt(value));
  useEffect(() => setText(fmt(value)), [value]);
  const send = () => {
    const v = parseFloat(text);
    if (Number.isFinite(v) && v !== value) onChange(v);
    else setText(fmt(value));
  };
  return (
    <label className="num" style={width ? { width } : undefined}>
      {label}
      <input
        type="number"
        step={step}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={send}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}

/** 現值 + 相對基準的 Δ 小字 */
export function DeltaCell({ now, before }: { now: number; before?: number }) {
  const d = before === undefined || !Number.isFinite(before) ? 0 : now - before;
  return (
    <span className="cell">
      {fmt(now)}
      {Math.abs(d) >= 0.05 && <small className={d > 0 ? 'up' : 'dn'}>{d > 0 ? '+' : ''}{d.toFixed(1)}</small>}
    </span>
  );
}
