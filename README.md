# 连锁餐饮运营管理系统

基于 Next.js、TypeScript、Ant Design、Prisma 与 MySQL 构建的运营管理 PC 后台。

## 已完成的首期能力

- `/lead_pc/login`：安全登录、记住账号、密码可见性切换、管理员联系方式提示、会话管理；
- `/lead_pc/dashboard`：合同、门店、到期提醒、登录用户与任务概览；
- `/lead_pc/stores/contracts`：合同筛选、列表与新增合同；
- `/lead_pc/stores/list`：门店筛选、列表与新增门店；
- `/lead_pc/settings/*`：统一设置菜单，提供角色、用户、数据字典、操作日志与高风险业务数据清空页面；
- 运营、巡店、任务、员工、培训、会议、通知等模块均已接入统一导航和可扩展页面框架。

## 本地启动

项目已配置本机 MySQL 数据库 `canyin_system`。首次运行或需要重建基础数据时执行：

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

访问 `http://localhost:3000/lead_pc/login`。

初始超级管理员账号为 `admin`，初始密码为 `Admin@123456`。首次正式部署后请立即在用户管理中修改初始密码。

## 数据与安全说明

- 数据库连接与会话密钥仅保存在 `.env`，该文件已被 Git 忽略，不会暴露到浏览器端。
- 写接口会校验登录状态；“清空业务数据”还会校验超级管理员角色，并要求选择范围、输入确认文案及二次确认。
- `prisma/seed.ts` 只在数据库没有合同示例数据时写入演示业务数据，方便验收页面状态。
