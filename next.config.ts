import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 国内单机部署友好：允许 standalone 输出
  output: "standalone",
  // 避免打包 sql.js WASM / xlsx 导致服务端异常
  serverExternalPackages: ["sql.js", "xlsx"],
  experimental: {
    // QCE 群导出 xlsx 可达数十 MB
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
