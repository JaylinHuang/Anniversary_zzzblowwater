/** 全站氛围层：很淡的扫描线 + 颗粒，固定在最上层但不拦截点击 */
export function Atmosphere() {
  return (
    <>
      <div aria-hidden className="fx-scan" />
      <div aria-hidden className="fx-grain" />
    </>
  );
}
