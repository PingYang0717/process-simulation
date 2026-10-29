import { DeleteOutlined, RollbackOutlined, VerticalAlignBottomOutlined, VerticalAlignTopOutlined } from '@ant-design/icons';
import { Button, Checkbox, Empty, Flex, InputNumber, Radio, Select, Space, Table, Typography } from 'antd';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Editor } from '../editor/useEditor';
import { signed } from '../editor/view';
import { bboxOf, edgeLength, polyOf, ringsOf } from '../model/geometry';
import type { Model } from '../model/types';
import { materialOf } from '../raster/exportRaster';
import { VOID_ID } from '../raster/importRaster';
import { MoveForm, PushForm } from '../ui/MoveForm';
import { StatTile } from '../ui/Stat';
import { Swatch } from '../ui/Swatch';

const { Text } = Typography;

/** 區域外框（px） */
const boxOf = (m: Model, id: string) => {
  const r = m.regions.find((x) => x.id === id);
  if (!r) return undefined;
  const b = bboxOf(polyOf(m, r));
  return { w: b.x1 - b.x0, h: b.y1 - b.y0, x: b.x0, y: b.y0 };
};

function Section({ title, extra, children }: { title: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="insp-sec">
      <Flex justify="space-between" align="center" className="insp-sec-head">
        <h3>{title}</h3>
        {extra}
      </Flex>
      {children}
    </section>
  );
}

function Title({ icon, title, sub }: { icon: ReactNode; title: string; sub?: string }) {
  return (
    <Flex align="center" gap={10}>
      {icon}
      <Flex vertical>
        <Text strong style={{ fontSize: 16 }}>{title}</Text>
        {sub && <Text type="secondary" style={{ fontSize: 12 }}>{sub}</Text>}
      </Flex>
    </Flex>
  );
}

function BaselineBar({ ed }: { ed: Editor }) {
  return (
    <Space size={8}>
      <Button size="small" onClick={ed.pinBaseline}>以現在為基準</Button>
      <Button size="small" type="text" onClick={ed.baselineOriginal}>和原圖比</Button>
    </Space>
  );
}

const baselineText = (ed: Editor) => (ed.baseline ? `比較：${ed.baseline.label}` : '比較：尚無');

function MaterialPicker({ ed, value }: { ed: Editor; value?: string }) {
  return (
    <Flex gap={8}>
      <Select
        style={{ flex: 1 }}
        value={value}
        placeholder="多種材質"
        onChange={(v) => ed.setMaterial(v)}
        options={ed.materials.map((m) => ({ value: m.id, label: <Flex align="center" gap={8}><Swatch fill={m.fill} isVoid={m.isVoid} />{m.name}</Flex> }))}
        aria-label="材質"
      />
      <Button onClick={() => ed.setMaterial(VOID_ID)}>設為 VOID</Button>
    </Flex>
  );
}

const KeysHint = () => (
  <Text type="secondary" style={{ fontSize: 12 }}>
    也可以按 <kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> 每次 1 px，加 <kbd>Shift</kbd> 每次 10 px
  </Text>
);

function RegionInspector({ ed, id, changed }: { ed: Editor; id: string; changed: boolean }) {
  const r = ed.model.regions.find((x) => x.id === id)!;
  const mat = materialOf(ed.materials, r.material);
  const now = boxOf(ed.model, id)!;
  const was = ed.baseline ? boxOf(ed.baseline.model, id) : undefined;
  const k = ed.nmPerPx;
  return (
    <>
      <Title icon={<Swatch fill={mat.fill} isVoid={mat.isVoid} size={20} />} title={r.label} sub={`${mat.name} · ${changed ? '已改動' : '未改動'}`} />
      <Section title="尺寸" extra={<Text type="secondary" style={{ fontSize: 12 }}>{baselineText(ed)}</Text>}>
        <div className="stat-grid">
          <StatTile label="寬 W" now={now.w} before={was?.w} nmPerPx={k} />
          <StatTile label="高 H" now={now.h} before={was?.h} nmPerPx={k} />
          <StatTile label="左緣 X" now={now.x} before={was?.x} nmPerPx={k} />
          <StatTile label="頂部 Y" now={now.y} before={was?.y} nmPerPx={k} />
        </div>
        <BaselineBar ed={ed} />
      </Section>
      <Section title="移動">
        <MoveForm ed={ed} />
        <KeysHint />
      </Section>
      <Section title="材質">
        <MaterialPicker ed={ed} value={r.material} />
      </Section>
      <Section title="排列">
        <Space>
          <Button icon={<VerticalAlignTopOutlined />} onClick={() => ed.bringToFront()}>移到最上層</Button>
          <Button icon={<VerticalAlignBottomOutlined />} onClick={() => ed.sendToBack()}>移到最下層</Button>
        </Space>
      </Section>
    </>
  );
}

function MultiInspector({ ed }: { ed: Editor }) {
  const k = ed.nmPerPx;
  const ids = ed.regionSel;
  const regions = ids.map((id) => ed.model.regions.find((r) => r.id === id)).filter((r) => !!r);
  const mats = new Set(regions.map((r) => r.material));
  const rows = regions.map((r) => ({ key: r.id, label: r.label, now: boxOf(ed.model, r.id)!, was: ed.baseline ? boxOf(ed.baseline.model, r.id) : undefined }));
  const cell = (f: 'w' | 'h' | 'x' | 'y', nm: boolean) => (_: unknown, row: (typeof rows)[number]) => {
    const v = row.now[f];
    const d = row.was ? v - row.was[f] : 0;
    return (
      <div className="dim-cell">
        {v}
        {d ? <small className="up">{signed(d)}</small> : nm ? <small>{(v * k).toFixed(1)} nm</small> : null}
      </div>
    );
  };
  const avg = (f: 'w' | 'h' | 'x' | 'y') => (rows.reduce((s, r) => s + r.now[f], 0) / (rows.length || 1)).toFixed(1);
  const firstMat = regions[0] ? materialOf(ed.materials, regions[0].material) : null;
  return (
    <>
      <Title
        icon={firstMat ? <Swatch fill={firstMat.fill} isVoid={firstMat.isVoid} size={20} /> : null}
        title={`已選 ${regions.length} 個區域`}
        sub={mats.size === 1 && firstMat ? `都是 ${firstMat.name}` : `${mats.size} 種材質`}
      />
      <Section title="尺寸" extra={<Text type="secondary" style={{ fontSize: 12 }}>{baselineText(ed)}</Text>}>
        <Table
          size="small"
          bordered={false}
          className="dim-table"
          pagination={false}
          dataSource={rows}
          columns={[
            { title: '區域', dataIndex: 'label', key: 'label', render: (v: string) => <span style={{ whiteSpace: 'nowrap' }}>{v}</span> },
            { title: '寬 W', key: 'w', align: 'right', render: cell('w', true) },
            { title: '高 H', key: 'h', align: 'right', render: cell('h', true) },
            { title: 'X', key: 'x', align: 'right', render: cell('x', false) },
            { title: 'Y', key: 'y', align: 'right', render: cell('y', false) },
          ]}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}><Text strong>平均</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">{avg('w')}</Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="right">{avg('h')}</Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right">—</Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right">{avg('y')}</Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />
        <Text type="secondary" style={{ fontSize: 12 }}>單位 px；小字是 nm，或和比較基準相比的變化</Text>
        <BaselineBar ed={ed} />
      </Section>
      <Section title="一起移動">
        <MoveForm ed={ed} applyLabel={`套用到 ${regions.length} 個區域`} />
      </Section>
      <Section title="材質">
        <MaterialPicker ed={ed} value={mats.size === 1 ? [...mats][0] : undefined} />
      </Section>
      <Section title="編輯方式">
        <Checkbox checked={ed.mirror} onChange={(e) => ed.setMirror(e.target.checked)}>推其中一個的邊時，其他已選區域的對應位置一起動</Checkbox>
        <Checkbox checked={ed.follow} onChange={(e) => ed.setFollow(e.target.checked)}>推邊時，外面包著的薄層一起推</Checkbox>
      </Section>
    </>
  );
}

/** 節點所在的交界：哪些區域的輪廓經過它 */
const owners = (m: Model, id: string) => m.regions.filter((r) => ringsOf(r).some((ring) => ring.includes(id))).map((r) => r.label);

function NodeInspector({ ed }: { ed: Editor }) {
  const k = ed.nmPerPx;
  const single = ed.vertexSel.length === 1;
  const id = ed.vertexSel[0];
  const v = ed.model.vertices[id];
  const orig = single ? ed.originalPos(id) : null;
  const [x, setX] = useState<number | null>(v?.x ?? 0);
  const [y, setY] = useState<number | null>(v?.y ?? 0);
  useEffect(() => { if (v) { setX(v.x); setY(v.y); } }, [v?.x, v?.y]);
  const where = single ? owners(ed.model, id) : [];
  const commitPos = () => { if (v && (x !== v.x || y !== v.y)) ed.moveNodeTo(x ?? v.x, y ?? v.y); };
  const moved = orig && v && (orig[0] !== v.x || orig[1] !== v.y);
  return (
    <>
      <Title
        icon={<span className="node-dot" aria-hidden="true" />}
        title={single ? '節點' : `${ed.vertexSel.length} 個節點`}
        sub={where.length > 1 ? `在 ${where.slice(0, 2).join(' 與 ')} 的交界上` : where[0] ? `在 ${where[0]} 上` : undefined}
      />
      {single && v ? (
        <Section title="位置">
          <Flex gap={8}>
            <label className="field"><span>X</span><InputNumber value={x} onChange={setX} precision={0} addonAfter="px" onBlur={commitPos} onPressEnter={commitPos} /></label>
            <label className="field"><span>Y</span><InputNumber value={y} onChange={setY} precision={0} addonAfter="px" onBlur={commitPos} onPressEnter={commitPos} /></label>
          </Flex>
          <Flex justify="space-between">
            <Text type="secondary" style={{ fontSize: 12 }}>{(v.x * k).toFixed(1)} nm, {(v.y * k).toFixed(1)} nm</Text>
            {moved && orig && <Text style={{ fontSize: 12, color: '#ad4e00' }}>原本在 ({orig[0]}, {orig[1]})</Text>}
          </Flex>
        </Section>
      ) : (
        <Section title="一起移動"><MoveForm ed={ed} /></Section>
      )}
      <Section title="拉動時">
        <Radio.Group value={ed.falloffMode} onChange={(e) => ed.setFalloffMode(e.target.value)} className="radio-card">
          <Radio value="smooth">順著一起動<div className="radio-sub">到左右節點為止的線平滑跟著走</div></Radio>
          <Radio value="single">只動這一點<div className="radio-sub">也可以拖的時候按住 Shift 暫時切換</div></Radio>
        </Radio.Group>
      </Section>
      <Section title="節點">
        <Space>
          <Button danger icon={<DeleteOutlined />} onClick={ed.deleteNodes}>刪除節點</Button>
          {single && <Button type="text" icon={<RollbackOutlined />} disabled={!moved} onClick={ed.resetNode}>回到原位</Button>}
        </Space>
        <Text type="secondary" style={{ fontSize: 12 }}>刪除只是不再顯示這個點，形狀不會變</Text>
      </Section>
    </>
  );
}

function EdgeInspector({ ed }: { ed: Editor }) {
  const k = ed.nmPerPx;
  const edges = ed.edgeSel.map((key) => ed.edgeByKey.get(key)).filter((e) => !!e);
  const total = (m: Model) => edges.reduce((s, e) => s + (edgeLength(m, e.a, e.b) ?? 0), 0);
  const now = total(ed.model), was = ed.baseline ? total(ed.baseline.model) : undefined;
  const owner = ed.model.regions.find((r) => r.id === ed.edgeOwner);
  const mat = owner ? materialOf(ed.materials, owner.material) : null;
  return (
    <>
      <Title icon={mat ? <Swatch fill={mat.fill} isVoid={mat.isVoid} size={20} /> : null} title={`${edges.length} 段邊`} sub={owner ? `${owner.label} 的邊` : undefined} />
      <Section title="長度" extra={<Text type="secondary" style={{ fontSize: 12 }}>{baselineText(ed)}</Text>}>
        <div className="stat-grid one">
          <StatTile label="總長" now={Math.round(now * 10) / 10} before={was !== undefined ? Math.round(was * 10) / 10 : undefined} nmPerPx={k} />
        </div>
      </Section>
      <Section title="往外推"><PushForm ed={ed} /></Section>
      <Section title="移動"><MoveForm ed={ed} /><KeysHint /></Section>
      <Section title="編輯方式">
        <Checkbox checked={ed.follow} onChange={(e) => ed.setFollow(e.target.checked)}>推邊時，外面包著的薄層一起推</Checkbox>
        <Checkbox checked={ed.mirror} onChange={(e) => ed.setMirror(e.target.checked)}>選了多個區域時，對應位置一起動</Checkbox>
      </Section>
    </>
  );
}

export function Inspector({ ed, changed }: { ed: Editor; changed: Set<string> }) {
  if (ed.vertexSel.length) return <NodeInspector ed={ed} />;
  if (ed.edgeSel.length) return <EdgeInspector ed={ed} />;
  if (ed.regionSel.length === 1) return <RegionInspector ed={ed} id={ed.regionSel[0]} changed={changed.has(ed.regionSel[0])} />;
  if (ed.regionSel.length > 1) return <MultiInspector ed={ed} />;
  const mats = ed.materials.filter((m) => !m.isVoid).length;
  return (
    <Flex vertical gap={24} style={{ paddingTop: 40 }}>
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="在畫布或左邊清單點一個區域，這裡會顯示它的尺寸與可以做的事" />
      <div className="overview">
        <div><span>{ed.model.regions.length}</span>區域</div>
        <div><span>{mats}</span>種材質</div>
        <div><span>{ed.imported.width}×{ed.imported.height}</span>像素</div>
      </div>
    </Flex>
  );
}
