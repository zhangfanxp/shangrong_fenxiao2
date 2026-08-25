# 连锁餐饮运营管理系统

基于 Next.js、TypeScript、Ant Design、Prisma 与 MySQL 构建的运营管理 PC 后台。

## 已完成的首期能力

- `/lead_pc/login`：安全登录、记住账号、密码可见性切换、管理员联系方式提示、会话管理；
- `/lead_pc/dashboard`：合同、门店、到期提醒、登录用户与任务概览；
- `/lead_pc/stores/contracts`：合同筛选、列表与新增合同；
- `/lead_pc/stores/list`：门店筛选、列表与新增门店；
- `/lead_pc/settings/*`：统一设置菜单，提供角色、用户、数据字典、操作日志与高风险业务数据清空页面；
- 运营、巡店、任务、员工、培训、会议、通知等模块均已接入统一导航和可扩展页面框架。

## 本地开发启动

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

## 在 Mac 上部署

### 1. 环境准备

目标 Mac 需要安装 Node.js、npm 和 MySQL，并能够访问门店任务附件使用的 R2 服务。将项目放到一个长期固定的目录中，然后在项目根目录创建 `.env`：

```bash
cp .env.example .env
```

至少需要正确配置 `DATABASE_URL`、`AUTH_SECRET` 和 `R2_CONFIG_ENCRYPTION_KEY`。不要直接沿用示例密钥，也不要把正式环境的 `.env` 提交到代码仓库。

### 2. 安装、同步数据库并构建

在项目根目录执行：

```bash
npm install
npm run db:generate
npm run db:push
npm run tasks:backfill-schedules
npm run build
```

`tasks:backfill-schedules` 用于给已有周任务、月任务补齐新的周期字段，可以重复执行。已有正式数据库不要执行 `npm run db:seed`，该命令只用于首次创建演示环境。

### 3. 启动应用

生产构建完成后可以执行：

```bash
npm start
```

默认访问地址为 `http://localhost:3000/lead_pc/login`。如果使用反向代理或自定义域名，请分别将 `/lead_pc`、`/lead_h5` 和 `/store_h5` 路径转发到该 Next.js 服务。

## 数据与安全说明

- 数据库连接与会话密钥仅保存在 `.env`，该文件已被 Git 忽略，不会暴露到浏览器端。
- 写接口会校验登录状态；“清空业务数据”还会校验超级管理员角色，并要求选择范围、输入确认文案及二次确认。
- `prisma/seed.ts` 只在数据库没有合同示例数据时写入演示业务数据，方便验收页面状态。

## 门店 H5 的 R2 直传

门店任务附件使用服务端签发的短期 Signed PUT URL，由浏览器直接上传至任务配置绑定的 R2 桶；服务端随后通过 `HeadObject` 校验并登记 Object Key。新增 R2 桶时需要配置浏览器直传 CORS，生产环境建议将 `AllowedOrigins` 限定为实际 H5 域名：

```json
[
  {
    "AllowedOrigins": ["https://your-domain.example"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type", "If-None-Match"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

## Mac 定时生成门店任务与发布通知

同一个每分钟运行的服务同时负责两项工作：按系统参数生成门店任务，以及扫描 `待发布 AND releaseAt <= 当前时间` 的通知并将其幂等地切换为已发布。通知检查不受门店任务设定时间限制，因此会在发布日期 06:00 后的首次检查中发布；临时失败的记录会在后续检查中继续重试。

如只需手动验证通知调度链路，可运行：

```bash
npm run notifications:scheduler:check
```

外部 Cron 也可以使用 `POST /api/notifications/publish-due`，通过 `Authorization: Bearer <NOTIFICATION_SCHEDULER_SECRET>` 调用；未单独配置时会回退使用 `TASK_SCHEDULER_SECRET`。

系统参数中可维护每天的自动执行时间。Mac 端使用 `launchd` 每分钟检查一次，到达设置时间后只生成当天应执行的日任务、周任务和月任务；同一天成功执行后不会重复运行，关机错过后当天重新开机可延迟执行，但不会补发昨天及更早任务。

### 安装并启动

`launchd` 服务属于 Mac 本机配置，不会随着项目目录自动迁移。每台作为定时任务主机的 Mac 都需要单独执行一次：

```bash
npm run tasks:scheduler:install
```

安装脚本会记录当前项目绝对路径和 Node.js 路径，并创建：

```text
~/Library/LaunchAgents/com.canyin.task-scheduler.plist
```

如果项目目录或 Node.js 安装位置发生变化，需要在新位置重新执行 `npm run tasks:scheduler:install`。

该服务使用 `LaunchAgent`，对应的 Mac 用户登录后才会运行。系统每分钟检查一次，但数据库每天只允许成功执行一次。多台 Mac 连接同一数据库时不会重复生成任务，不过生产环境建议只指定一台 Mac 作为调度主机，便于管理和排查。

> 注意：如果安装时已经超过系统参数设置的自动执行时间，服务启动后会立即尝试生成当天任务。安装前请先确认当天任务配置是否已经准备好。

### 验证运行状态

确认服务已经加载：

```bash
launchctl print "gui/$(id -u)/com.canyin.task-scheduler"
```

查看运行日志和错误日志：

```bash
tail -f data/logs/task-scheduler.log
tail -f data/logs/task-scheduler.error.log
```

也可以进入运营PC端的《设置》→《系统参数》，查看今日自动任务状态、最近执行时间和生成结果。

### 将项目迁移到另一台 Mac

1. 在新 Mac 上完成环境准备、项目构建和数据库连接配置。
2. 确认新旧 Mac 使用的是同一个正式数据库。
3. 在新 Mac 项目目录执行 `npm run tasks:scheduler:install`。
4. 使用 `launchctl print` 和日志确认新 Mac 的服务正常运行。
5. 确认无误后，停用旧 Mac 上的定时服务。

迁移期间新旧两台 Mac 短时间同时运行是安全的，数据库执行锁会避免同一天重复生成；确认新主机正常后仍应及时停用旧主机。

### 停用或卸载

在不再承担调度工作的 Mac 上执行：

```bash
launchctl bootout "gui/$(id -u)/com.canyin.task-scheduler"
rm ~/Library/LaunchAgents/com.canyin.task-scheduler.plist
```

卸载只会移除该 Mac 的定时检查服务，不会删除数据库中的任务设置、任务记录或历史执行记录。
