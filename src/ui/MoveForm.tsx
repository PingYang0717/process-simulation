import { Button, Flex, InputNumber, Segmented, Typography } from 'antd';
import { useEffect, useState } from 'react';
import type { Editor } from '../editor/useEditor';
import { signed } from '../editor/view';

/**
 * 移動：輸入 Δx / Δy（px）後套用，規則與方向鍵相同。
 * 只選一個節點時可切到「到座標」直接填 X / Y。
 */
export function MoveForm({ ed, onDone, applyLabel = '套用位移' }: { ed: Editor; onDone?: () => void; applyLabel?: string }) {
  const node = ed.vertexSel.length === 1 ? ed.model.vertices[ed.vertexSel[0]] : null;
  const [mode, setMode] = useState<'delta' | 'to'>('delta');
  const [dx, setDx] = useState<number | null>(0);
  const [dy, setDy] = useState<number | null>(0);
  const [x, setX] = useState<number | null>(node?.x ?? 0);
  const [y, setY] = useState<number | null>(node?.y ?? 0);
  useEffect(() => {
    if (node) { setX(node.x); setY(node.y); }
  }, [node?.x, node?.y]);
  const k = ed.nmPerPx;
  const toMode = mode === 'to' && !!node;
  const apply = () => {
    if (toMode) ed.moveNodeTo(x ?? node!.x, y ?? node!.y);
    else ed.nudge(Math.round(dx ?? 0), Math.round(dy ?? 0));
    onDone?.();
  };
  const hint = toMode ? `${((x ?? 0) * k).toFixed(1)} nm, ${((y ?? 0) * k).toFixed(1)} nm` : `= ${signed((dx ?? 0) * k, 1)} nm、${signed((dy ?? 0) * k, 1)} nm`;
  return (
    <Flex vertical gap={10}>
      {node && (
        <Segmented size="small" value={mode} onChange={(v) => setMode(v as 'delta' | 'to')} options={[{ label: '位移', value: 'delta' }, { label: '到座標', value: 'to' }]} />
      )}
      <Flex gap={8}>
        <label className="field">
          <span>{toMode ? 'X' : '水平 Δx'}</span>
          <InputNumber value={toMode ? x : dx} onChange={toMode ? setX : setDx} step={1} precision={0} addonAfter="px" onPressEnter={apply} />
        </label>
        <label className="field">
          <span>{toMode ? 'Y' : '垂直 Δy（往上為負）'}</span>
          <InputNumber value={toMode ? y : dy} onChange={toMode ? setY : setDy} step={1} precision={0} addonAfter="px" onPressEnter={apply} />
        </label>
      </Flex>
      <Flex justify="space-between" align="center">
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{hint}</Typography.Text>
        <Button type="primary" onClick={apply}>{applyLabel}</Button>
      </Flex>
    </Flex>
  );
}

/** 往外推：已選邊沿法線推 N px，負值往內 */
export function PushForm({ ed, onDone }: { ed: Editor; onDone?: () => void }) {
  const [d, setD] = useState<number | null>(2);
  const owner = ed.model.regions.find((r) => r.id === ed.edgeOwner)?.label;
  const apply = () => {
    ed.pushOutward(Math.round(d ?? 0));
    onDone?.();
  };
  return (
    <Flex vertical gap={8}>
      <Flex gap={8} align="center">
        <InputNumber value={d} onChange={setD} step={1} precision={0} addonAfter="px" style={{ width: 130 }} onPressEnter={apply} />
        <Button type="primary" onClick={apply}>套用</Button>
      </Flex>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {owner ? `遠離 ${owner} 推出去；` : ''}負值往內縮{ed.follow ? '；外面包著的薄層會一起推' : ''}
      </Typography.Text>
    </Flex>
  );
}
