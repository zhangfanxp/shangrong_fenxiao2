import "./globals.css";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { ConfigProvider } from "antd";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "连锁餐饮运营管理系统", description: "餐饮连锁门店运营管理平台" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><AntdRegistry><ConfigProvider theme={{ token: { colorPrimary: "#1677FF", colorSuccess: "#52C41A", colorWarning: "#FAAD14", colorError: "#FF4D4F", borderRadius: 8, fontSize: 14, controlHeight: 40 } }}>{children}</ConfigProvider></AntdRegistry></body></html>;
}
