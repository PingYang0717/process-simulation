import type { ReactNode } from 'react';
import { signed } from '../editor/view';

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

/** 現值 px + nm 小字 + 相對基準的 Δpx */
export function PxCell({ now, before, nmPerPx }: { now: number; before?: number; nmPerPx: number }) {
  const d = before === undefined ? 0 : now - before;
  return (
    <span className="cell">
      {now} px
      <small className="sub">{(now * nmPerPx).toFixed(1)} nm</small>
      {before !== undefined && d !== 0 && <small className={d > 0 ? 'up' : 'dn'}>{signed(d)} px</small>}
    </span>
  );
}
