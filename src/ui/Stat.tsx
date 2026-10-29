import { signed } from '../editor/view';

/** 尺寸格：大字 px、小字 nm；和基準不同時整格標橘色並寫出差多少 */
export function StatTile({ label, now, before, nmPerPx }: { label: string; now: number; before?: number; nmPerPx: number }) {
  const d = before === undefined ? 0 : now - before;
  return (
    <div className={'stat' + (d ? ' changed' : '')}>
      <div className="stat-label">
        {label}
        {d !== 0 && <span className="stat-delta">{signed(d)} px</span>}
      </div>
      <div className="stat-value">{now}<span>px</span></div>
      <div className="stat-sub">{(now * nmPerPx).toFixed(1)} nm</div>
    </div>
  );
}
