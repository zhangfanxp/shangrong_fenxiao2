import { Result } from "antd";

export default function ForbiddenPage() {
  return <main className="page-wrap"><Result status="403" title="暂无访问权限" subTitle="当前角色未配置此页面权限。如需使用，请联系平台管理员调整角色权限。" /></main>;
}
