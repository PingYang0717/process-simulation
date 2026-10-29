/** 材質色塊；VOID 用斜線表示 */
export function Swatch({ fill, isVoid, size = 12 }: { fill: string; isVoid?: boolean; size?: number }) {
  return (
    <span
      className={'swatch' + (isVoid ? ' void' : '')}
      style={{ width: size, height: size, background: isVoid ? undefined : fill }}
      aria-hidden="true"
    />
  );
}
