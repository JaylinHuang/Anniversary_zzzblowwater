import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 国内单机部署友好：允许 standalone 输出
  output: "standalone",
  // 避免打包 sql.js WASM / xlsx 导致服务端异常
  serverExternalPackages: ["sql.js", "xlsx"],
  experimental: {
    // 群聊 JSON 可达数十 MB；中间件默认只放行 10MB
    serverActions: {
      bodySizeLimit: "80mb",
    },
    middlewareClientMaxBodySize: "80mb",
  },
  webpack: (config, { nextRuntime }) => {
    // instrumentation 会被编进 Edge。凌晨灌库只在 Node 里动态加载，
    // 这里避免 Edge 构建去解析 fs / path。
    if (nextRuntime === "edge") {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    return config;
  },
};

export default nextConfig;
