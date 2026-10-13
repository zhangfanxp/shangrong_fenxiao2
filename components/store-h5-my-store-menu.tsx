"use client";

import { ArrowLeftOutlined, DollarOutlined, ShopOutlined, TagsOutlined, TeamOutlined } from "@ant-design/icons";
import { Button, Empty } from "antd";
import { useRouter } from "next/navigation";

const entries = [
  { key: "employees", name: "员工", description: "查看本店员工档案", icon: <TeamOutlined />, href: "/store_h5/my-store/employees" },
  { key: "cost", name: "成本", description: "查看及维护门店成本", icon: <DollarOutlined />, href: "/store_h5/my-store/cost" },
  { key: "aliases", name: "别名", description: "查看及维护平台别名", icon: <TagsOutlined />, href: "/store_h5/my-store/aliases" },
] as const;

export function StoreH5MyStoreMenu({ storeName, visibleKeys }: { storeName: string | null; visibleKeys: string[] }) {
  const router = useRouter();
  const visible = entries.filter(entry => visibleKeys.includes(entry.key));
  return <main className="store-h5-page store-h5-task-page store-h5-my-store-page">
    <header className="store-h5-subheader"><Button type="text" aria-label="返回首页" icon={<ArrowLeftOutlined />} onClick={() => router.push("/store_h5")} /><div><strong>我的门店</strong><small>{storeName || "尚未关联门店"}</small></div><span /></header>
    <section className="store-h5-my-store-hero"><span><ShopOutlined /></span><div><small>当前门店</small><h1>{storeName || "未关联门店"}</h1><p>员工、成本和平台别名信息</p></div></section>
    <section className="store-h5-section"><h2>门店档案</h2>{visible.length ? <div className="store-h5-my-store-grid">{visible.map(entry => <button key={entry.key} onClick={() => router.push(entry.href)}><span>{entry.icon}</span><div><strong>{entry.name}</strong><small>{entry.description}</small></div></button>)}</div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前角色暂无门店档案功能权限" />}</section>
  </main>;
}
