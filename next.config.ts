import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 国内单机部署友好：允许 standalone 输出
  output: "standalone",
  // 避免打包 sql.js WASM 导致服务端接口 500 空响应
  serverExternalPackages: ["sql.js"],
};

export default nextConfig;
