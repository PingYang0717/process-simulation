import { Alert, Button, Empty, Flex, Table, Typography } from 'antd';
import { useMemo } from 'react';
import type { Editor } from '../editor/useEditor';
import { signed } from '../editor/view';
import { ringsOf } from '../model/geometry';
import type { Model, Region, XY } from '../model/types';
import type { ExportResult } from '../raster/exportRaster';
import { exactRing, materialOf } from '../raster/exportRaster';
import { Swatch } from '../ui/Swatch';

const { Text } = Typography;

/** 多邊形面積（含孔洞），以輸出用的輪廓計算，近似實際像素數 */
const areaOf = (pts: XY[]) => Math.abs(pts.reduce((s, [x, y], i) => { const [x2, y2] = pts[(i + 1) % pts.length]; return s + x * y2 - x2 * y; }, 0)) / 2;
const regionArea = (m: Model, ed: Editor, r: Region) => {
  const rings = ringsOf(r).map((ring) => areaOf(exactRing(m, ed.imported, ring)));
  return rings[0] - rings.slice(1).reduce((s, a) => s + a, 0);
};

/** 右欄「改動」：改了多少、改了哪些、各材質面積、輸出檢查 */
export function ChangesTab({ ed, result, onExportPng, onExportLabels }: { ed: Editor; result: ExportResult; onExportPng: () => void; onExportLabels: () => void }) {
  const W = ed.imported.width, H = ed.imported.height;
  const items = useMemo(() => result.changed.map((id) => {
    const r = ed.model.regions.find((x) => x.id === id)!;
    const o = ed.imported.model.regions.find((x) => x.id === id);
    const mat = materialOf(ed.materials, r.material);
    const what = o && o.material !== r.material ? `換成 ${mat.name}` : '形狀改了';
    const d = Math.round(regionArea(ed.model, ed, r) - (o ? regionArea(ed.imported.model, ed, o) : 0));
    return { r, mat, what, d };
  }), [result, ed.model, ed.imported, ed.materials]);
  const ledger = result.byMaterial.filter((t) => t.before !== t.after);
  const sumB = result.byMaterial.reduce((s, t) => s + t.before, 0), sumA = result.byMaterial.reduce((s, t) => s + t.after, 0);

  if (!result.diffPx) {
    return <Empty style={{ paddingTop: 40 }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="還沒有改動，匯出的圖會和原圖一模一樣" />;
  }
  return (
    <Flex vertical gap={24}>
      <div className="stat-grid">
        <div className="stat"><div className="stat-label">改動像素</div><div className="stat-value">{result.diffPx.toLocaleString()}</div><div className="stat-sub">佔全圖 {((result.diffPx / (W * H)) * 100).toFixed(2)}%</div></div>
        <div className="stat"><div className="stat-label">涉及區域</div><div className="stat-value">{result.changed.length}</div><div className="stat-sub">輸出尺寸與原圖相同</div></div>
      </div>

      <section className="insp-sec">
        <h3>改了哪些地方</h3>
        {items.map(({ r, mat, what, d }) => (
          <button type="button" key={r.id} className="change-item" onClick={() => ed.selectRegions([r.id])}>
            <Swatch fill={mat.fill} isVoid={mat.isVoid} />
            <span className="change-name">{r.label}<small>{what}</small></span>
            <span className={'change-d' + (d > 0 ? ' up' : d < 0 ? ' dn' : '')}>{d ? signed(d) : '±0'}</span>
          </button>
        ))}
      </section>

      {ledger.length > 0 && (
        <section className="insp-sec">
          <h3>各材質面積</h3>
          <Table
            size="small"
            className="dim-table"
            pagination={false}
            dataSource={ledger.map((t) => ({ ...t, key: t.id }))}
            columns={[
              { title: '材質', key: 'name', render: (_, t) => { const m = materialOf(ed.materials, t.id); return <Flex align="center" gap={6}><Swatch fill={m.fill} isVoid={m.isVoid} />{t.name}</Flex>; } },
              { title: '原圖', dataIndex: 'before', align: 'right', render: (v: number) => v.toLocaleString() },
              { title: '改動後', dataIndex: 'after', align: 'right', render: (v: number) => v.toLocaleString() },
              { title: '增減', key: 'd', align: 'right', render: (_, t) => <span className={t.after > t.before ? 'up' : 'dn'}>{signed(t.after - t.before)}</span> },
            ]}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}><Text strong>合計</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">{sumB.toLocaleString()}</Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">{sumA.toLocaleString()}</Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">{signed(sumA - sumB)}</Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>單位：像素。沒列出的材質沒有變。</Text>
        </section>
      )}

      {result.warnings.length ? (
        <Alert type="warning" showIcon message="輸出前請確認" description={<ul className="warn-list">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>} />
      ) : (
        <Alert type="success" showIcon message="檢查通過：沒有重疊、沒有變太薄的區域，顏色都屬於現有材質。" />
      )}

      <Flex gap={8}>
        <Button type="primary" block onClick={onExportPng}>匯出 PNG</Button>
        <Button onClick={onExportLabels}>材質編號圖</Button>
      </Flex>
    </Flex>
  );
}
