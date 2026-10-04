/**
 * 扭蛋胶囊：玩法页「群友扭蛋」的纯展示小部件，不含任何数据逻辑。
 *
 * - 上半青、下半琥珀、中间一道深色接缝，只用站点现有的青 / 琥珀 / 深色。
 * - 三种状态由父组件传入：
 *     idle     —— 静静浮着
 *     spinning —— 左右摇晃、上下蹦跳（请求进行中）
 *     open     —— 上盖弹开、中间炸出一圈光（结果已到）
 * - 动画全在 globals.css 的 .gacha-cap-* 里，prefers-reduced-motion 时停成静止的开盖状态。
 * - aria-hidden + pointer-events: none，既不读屏也不吃点击。
 */
export type GachaCapsuleState = "idle" | "spinning" | "open";

export function GachaCapsule({ state }: { state: GachaCapsuleState }) {
  return (
    <div aria-hidden className={`gacha-cap gacha-cap--${state}`}>
      {/* 开盖时炸开的光圈 */}
      <span className="gacha-cap-burst" />
      {/* 下半壳：琥珀 */}
      <span className="gacha-cap-half gacha-cap-bottom" />
      {/* 上半壳：青，开盖时向上弹起 */}
      <span className="gacha-cap-half gacha-cap-top" />
      {/* 中间接缝 */}
      <span className="gacha-cap-seam" />
    </div>
  );
}
