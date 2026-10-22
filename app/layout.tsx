import "./globals.css";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import type { Metadata, Viewport } from "next";
import { AppProviders } from "@/components/app-providers";

export const metadata: Metadata = { title: "连锁餐饮运营管理系统", description: "餐饮连锁门店运营管理平台" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><AntdRegistry><AppProviders>{children}</AppProviders></AntdRegistry></body></html>;
}
