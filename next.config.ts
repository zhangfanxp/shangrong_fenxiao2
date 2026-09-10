import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: projectRoot,
  experimental: { optimizePackageImports: ["antd", "@ant-design/icons"] },
  async redirects() {
    return [{ source: "/lead_pc/settings/assessments", destination: "/lead_pc/inspection/assessments", permanent: true }];
  },
};

export default nextConfig;
