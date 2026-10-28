import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

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
export function NumField({ label, value, onChange, step = 0.1, w }: { label: string; value: number; onChange: (v: number) => void; step?: number; w?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <label className="num" style={w ? { width: w } : undefined}>
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const v = parseFloat(text);
          if (Number.isFinite(v) && v !== value) onChange(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}

/** 現值 + 相對基準的 Δ 小字 */
export function DeltaCell({ now, before }: { now: number; before?: number }) {
  const d = before === undefined ? 0 : Math.round((now - before) * 10) / 10;
  return (
    <span className="cell">
      {now.toFixed(1)}
      {before !== undefined && d !== 0 && <small className={d > 0 ? 'up' : 'dn'}>{d > 0 ? '+' : '−'}{Math.abs(d).toFixed(1)}</small>}
    </span>
  );
}
