import { Button, Flex, InputNumber, Radio, Select, Slider, Switch, Typography } from 'antd';
import type { ReactNode } from 'react';
import type { Editor } from '../editor/useEditor';
import { Swatch } from '../ui/Swatch';

const Row = ({ label, sub, children }: { label: string; sub?: string; children: ReactNode }) => (
  <Flex justify="space-between" align="center" gap={12} className="set-row">
    <Flex vertical>
      <span>{label}</span>
      {sub && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{sub}</Typography.Text>}
    </Flex>
    {children}
  </Flex>
);

/** 右欄「顯示」：畫面、編輯方式、圖片設定 */
export function DisplayTab({ ed, showDiff, setShowDiff, showLabels, setShowLabels, alpha, setAlpha, backfill, setBackfill, onLoadSettings }: {
  ed: Editor; showDiff: boolean; setShowDiff: (v: boolean) => void; showLabels: boolean; setShowLabels: (v: boolean) => void;
  alpha: number; setAlpha: (v: number) => void; backfill: string; setBackfill: (v: string) => void; onLoadSettings: () => void;
}) {
  return (
    <Flex vertical gap={24}>
      <section className="insp-sec">
        <h3>畫面</h3>
        <Row label="改過的地方框紅線"><Switch checked={showDiff} onChange={setShowDiff} /></Row>
        <Row label="顯示區域名稱"><Switch checked={showLabels} onChange={setShowLabels} /></Row>
        <div className="set-row">
          <span>區域上色深淺</span>
          <Slider min={0} max={1} step={0.05} value={alpha} onChange={setAlpha} tooltip={{ formatter: (v) => `${Math.round((v ?? 0) * 100)}%` }} />
        </div>
      </section>
      <section className="insp-sec">
        <h3>編輯方式</h3>
        <Row label="推邊時，外面包著的薄層一起推" sub="關掉時推到碰到旁邊的層就停住"><Switch checked={ed.follow} onChange={ed.setFollow} /></Row>
        <Row label="選了多個區域時，對應位置一起動"><Switch checked={ed.mirror} onChange={ed.setMirror} /></Row>
        <div className="set-row">
          <span>拉節點時</span>
          <Radio.Group value={ed.falloffMode} onChange={(e) => ed.setFalloffMode(e.target.value)} optionType="button" size="small"
            options={[{ label: '順著一起動', value: 'smooth' }, { label: '只動這一點', value: 'single' }]} />
        </div>
      </section>
      <section className="insp-sec">
        <h3>圖片設定</h3>
        <Row label="1 像素 = ? nm" sub="只影響畫面上顯示的 nm">
          <InputNumber min={0.001} step={0.05} value={ed.nmPerPx} onChange={(v) => v && v > 0 && ed.setNmPerPx(v)} addonAfter="nm" style={{ width: 130 }} />
        </Row>
        <Row label="搬走後空出來的地方填">
          <Select value={backfill} onChange={setBackfill} style={{ width: 150 }}
            options={ed.materials.map((m) => ({ value: m.id, label: <Flex align="center" gap={8}><Swatch fill={m.fill} isVoid={m.isVoid} />{m.name}</Flex> }))} />
        </Row>
        <Button onClick={onLoadSettings}>重新上傳或重新分區…</Button>
      </section>
    </Flex>
  );
}
