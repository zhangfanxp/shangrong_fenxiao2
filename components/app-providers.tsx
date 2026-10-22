"use client";

import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";

dayjs.locale("zh-cn");

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: "#1677FF", colorSuccess: "#52C41A", colorWarning: "#FAAD14", colorError: "#FF4D4F", borderRadius: 8, fontSize: 14, controlHeight: 40 } }}>{children}</ConfigProvider>;
}
