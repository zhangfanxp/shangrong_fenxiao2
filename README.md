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

开发用 `db:seed` 会创建 `admin / Admin@123456` 和演示业务数据，只能用于本地开发。正式部署由 setup 页面创建用户指定的超级管理员，不会写入演示门店、合同或任务。

## macOS 本机生产部署

本节是当前项目在 Mac 上的正式部署手册。请按顺序执行，不要把“本地开发启动”中的 `db:push` 或 `db:seed` 命令用于正式环境。

### 部署模型与适用范围

- 主站只监听 `127.0.0.1`，默认地址为 `http://127.0.0.1:3000`，仅当前 Mac 可以访问；
- 主站和统一调度器以当前 macOS 用户的 `LaunchAgent` 运行；
- 登录该 macOS 用户后两个服务自动启动，退出登录后停止；
- 统一调度器每分钟检查一次门店任务、到期通知，以及用户后续按需启用的数据库自动备份；
- 本流程不会安装 Node.js、npm、MySQL 或创建 MySQL 用户，这些基础环境需要提前准备；
- 本流程不适用于“用户尚未登录也必须运行”或“局域网其他设备直接访问”的部署要求。此类需求需要另行设计系统级服务、HTTPS 和网络访问控制。

### 1. 部署前准备

#### 1.1 macOS 用户与项目目录

使用今后实际运行系统的普通 macOS 用户完成全部操作，不要使用 `sudo npm`，也不要先用其他用户安装再切换用户运行。

将项目放入不会删除、改名或移动的长期目录，例如：

```text
/Users/<用户名>/Services/canyin_system
```

LaunchAgent 会记录项目目录、Node.js 和脚本的绝对路径。部署完成后移动项目或更换 Node.js 安装路径，会导致自动启动失效。建议不要放在外接硬盘、临时目录、iCloud 同步目录中；放在“桌面”“文稿”或“下载”目录时，还可能受到 macOS 隐私权限限制。

从其他 CPU 架构的 Mac 复制项目时，不要复制旧机器的 `node_modules` 和 `.next`，应在目标 Mac 上重新安装依赖并构建。

#### 1.2 Node.js 与 MySQL

Setup 要求 Node.js 20 或更高版本。MySQL 服务应已经配置为开机启动，并能通过 TCP 连接。执行以下命令确认工具可用：

```bash
node --version
npm --version
mysql --version
```

Apple Silicon Homebrew 常用路径为 `/opt/homebrew/bin`，Intel Homebrew 常用路径为 `/usr/local/bin`。如果 `mysql` 不在当前 `PATH`，可以在启动 Setup 时明确指定：

```bash
MYSQL_BIN="/实际路径/mysql" npm run setup
```

`mysqldump` 或 `mariadb-dump` 不再是首次部署的必需工具。以后需要启用数据库备份时再安装，并通过 `.env` 的 `MYSQLDUMP_BIN` 指定绝对路径即可。

正式部署使用的 MySQL 应满足以下条件：

- 目标数据库名称建议使用默认值 `canyin_system`，Setup 会负责创建，不要预先导入业务表；
- 应用数据库账号必须已经存在，并能从 `127.0.0.1` 或页面填写的数据库地址登录；
- 该账号必须具有目标数据库的日常读写、建表、修改表和索引权限；由于升级程序也使用该账号执行迁移，不能只授予只读权限；启用数据库备份后还需具备导出所需权限；
- 最简单的授权方式是只对目标数据库授予完整权限，而不是授予整个 MySQL 实例的全局管理权限；
- 如果应用账号没有 `CREATE DATABASE` 权限，准备一个临时建库管理员账号。它只用于创建数据库，不会写入 `.env` 或数据库；应用账号仍需拥有新数据库的结构和数据操作权限。

Setup 只允许初始化不存在或没有任何表的数据库。发现目标数据库已有表时会立即停止，防止覆盖已有数据。

### 2. 安装依赖并生成生产构建

打开“终端”，进入项目根目录：

```bash
cd "/Users/<用户名>/Services/canyin_system"
npm install
npm run build
```

必须等 `npm run build` 成功结束后再继续。构建过程会同时执行部署契约检查和 Prisma Client 生成。首次正式部署不要手工执行以下命令：

```text
npm run db:push
npm run db:seed
npm run deploy:migrations
```

数据库创建、结构同步、部署基线和正式基础数据都由 Setup 按正确顺序处理。尤其不要执行 `db:seed`，它属于开发环境，会写入演示门店、合同和其他测试数据。

### 3. 启动 Setup 页面

在项目根目录执行：

```bash
npm run setup
```

Setup 服务只监听 `127.0.0.1:3210`，启动后会输出并自动打开带一次性随机访问令牌的本地地址，例如：

```text
http://127.0.0.1:3210/?token=<随机令牌>
```

安装完成前应保持该终端和浏览器页面开启。令牌只在本次 Setup 进程内有效；重启 Setup 后，旧页面出现“访问令牌无效”属于正常现象，应关闭旧页面并使用新打开的地址。不要把完整地址或令牌发送给其他人。

如果浏览器没有自动打开，可按住 Command 单击终端中显示的完整地址，或复制完整地址到本机浏览器。不要只打开不带 `token` 参数的 `http://127.0.0.1:3210`。

### 4. Setup 页面填写说明

| 区域 | 字段 | 填写要求 |
| --- | --- | --- |
| 应用设置 | 系统名称 | 1–50 个字符，将写入平台配置。 |
| 应用设置 | 本机端口 | `1024–65535`，不能使用 Setup 的 `3210`，并且不能被其他程序占用；默认 `3000`。 |
| MySQL | 数据库地址、端口 | 本机部署通常填写 `127.0.0.1` 和 `3306`。 |
| MySQL | 数据库名称 | 只能包含字母、数字和下划线，最多 64 个字符；默认 `canyin_system`。必须是不存在或没有表的空库。 |
| MySQL | 应用数据库账号、密码 | 系统日常运行、初始化结构、升级迁移和全量备份使用的账号。该账号会写入仅本机可读的 `.env`。 |
| MySQL | 建库管理员账号、密码 | 选填。仅在应用账号不能创建数据库时使用，不会保存。只填写账号而不填写对应密码会导致连接失败。 |
| 超级管理员 | 登录账号 | 3–30 位，以英文字母开头，只允许字母、数字、下划线、点和连字符。 |
| 超级管理员 | 姓名、电话 | 姓名必填；电话选填。 |
| 超级管理员 | 登录密码 | 至少 10 位，必须同时包含大写字母、小写字母、数字和特殊字符。请妥善保管，Setup 不会显示明文。 |

首次部署页面不要求填写 Cloudflare R2，也不要求设置数据库定时备份。系统安装完成并成功登录后，可根据实际使用情况分别在“设置 → R2 存储”和“设置 → 数据库备份”中配置。

页面顶部会展示环境检查结果：

- “错误”项目必须处理后才能部署；
- “警告”通常表示 LaunchAgent 尚未安装，首次部署时属于正常情况；
- 项目目录处于 macOS 隐私保护目录时会提示警告，建议先移动到长期目录再部署。

确认所有字段后，勾选空数据库确认项并点击“开始部署并验证”。部署执行过程中不要刷新页面、关闭终端、退出登录、休眠或断网。

### 5. Setup 自动执行的内容

首次部署按以下顺序执行，任何关键步骤失败都会停止后续操作并在页面中显示原因：

1. 检查 macOS、Node.js、`.next/BUILD_ID`、MySQL 客户端、端口和 LaunchAgent 状态；
2. 使用建库账号或应用账号创建 `utf8mb4` 数据库，并再次使用应用账号验证连接；
3. 原子写入 `.env`，自动生成会话密钥、任务调度密钥、通知调度密钥，以及供日后添加 R2 时使用的凭据加密密钥；
4. 将最新 Prisma 结构写入空数据库，并建立 `DeploymentMigration` 部署基线；
5. 创建或更新超级管理员、超级管理员角色、必要数据字典和岗位级别；
6. 验证数据库连接、超级管理员、角色和必要字典是否完整；
7. 写入本机部署状态，安装并启动主站和统一调度器 LaunchAgent；
8. 请求 `/api/health`，确认 Next.js、平台配置和 MySQL 均正常后才显示“部署完成”。

正式初始化只创建超级管理员和系统运行必需数据，不会创建任何演示品牌、门店、合同、任务或培训业务数据。

如果安装中途失败，已经创建的空库、配置或基础结构可能被安全保留。修正页面提示的问题后重新执行 `npm run setup`；Setup 只允许对同一主机、端口、数据库名和应用账号的未完成安装继续执行，不会把任意非空数据库误判为可继续初始化。不要为了绕过保护而删除 `data/deployment/pending-install.json`。

### 6. 安装产生的本机文件

| 路径 | 用途与注意事项 |
| --- | --- |
| `.env` | 数据库地址和本机密钥，权限设置为 `0600`，已被 Git 忽略。 |
| `.env.backup-*` | Setup 重写已有 `.env` 前生成的备份，包含敏感信息，同样不得提交或外传。 |
| `data/deployment/install-state.json` | 本机安装版本、端口、状态和最近验证结果；升级/修复需要该文件。 |
| `data/deployment/pending-install.json` | 失败重试使用的临时状态；成功后自动删除。 |
| `data/R2_Bucket/cloudflare_R2.json` | 登录系统后配置 R2 时才会生成；Access Key 和 Secret Key 经过加密，解密密钥位于 `.env`。 |
| `data/logs/` | 主站和统一调度器的标准输出、错误日志。 |
| `~/Library/LaunchAgents/com.canyin.web.plist` | 主站登录启动配置。 |
| `~/Library/LaunchAgents/com.canyin.scheduler.plist` | 门店任务、通知和备份统一调度配置。 |

这些本机文件不应提交到 Git。迁移已有正式系统时，`.env`、`config/` 和 `data/` 与数据库备份需要作为一个整体谨慎处理，不能只复制代码仓库。

### 7. 部署完成后的验证

默认端口下访问：

```text
http://127.0.0.1:3000/lead_pc/login
```

如果页面选择了其他端口，以 Setup 完成页显示的地址为准。使用刚才创建的超级管理员登录，然后检查系统设置及核心页面是否能够正常打开。

需要使用文件上传时，再进入“设置 → R2 存储”新增并测试 R2 配置；需要数据库备份时，再安装 `mysqldump`、完成 R2 配置，并进入“设置 → 数据库备份”设置备份计划。这两项都不会阻塞系统首次部署和基本功能使用。

在终端检查 HTTP 和数据库健康状态：

```bash
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
```

正常响应中的 `status` 应为 `ok`、`database` 应为 `true`。自定义端口时修改命令中的端口。

确认两个服务已加载：

```bash
launchctl print "gui/$(id -u)/com.canyin.web"
launchctl print "gui/$(id -u)/com.canyin.scheduler"
```

查看日志：

```bash
tail -f data/logs/web.log
tail -f data/logs/web.error.log
tail -f data/logs/scheduler.log
tail -f data/logs/scheduler.error.log
```

`com.canyin.web` 在异常退出后会自动重启；`com.canyin.scheduler` 每 60 秒运行一次。统一调度器没有到期工作时通常不输出日志，这是正常现象；只有执行了任务、发布了通知、完成了备份或发生错误时才记录内容。

最后应重启一次 Mac，登录同一 macOS 用户，不打开终端，重新执行健康检查并确认系统可登录。这个步骤可以验证 LaunchAgent、项目路径和 Node.js 路径在真实重启后仍然有效。

### 8. 定时任务行为

统一调度器同时负责：

- 按系统参数生成当天门店日任务、周任务和月任务；
- 发布到达计划时间的通知；
- 根据用户后续在“设置 → 数据库备份”中启用的计划生成 MySQL 全量备份并上传 R2；未配置时自动跳过。

每类任务都使用数据库执行锁防止同一执行点重复处理。Mac 在当天计划时间之后才登录时，调度器会在启动后补做当天仍应执行的工作，但不会自动补做昨天及更早日期的门店任务。

如果安装时已经超过当天任务自动执行时间，LaunchAgent 启动后可能立即生成当天任务。首次部署前应确认系统内相关任务配置已经准备好。生产环境建议只启用一台调度主机，即使数据库锁能够降低多台机器重复执行的风险，也不要长期依赖多主机并行调度。

需要人工触发一次完整调度检查时，可以执行：

```bash
npm run tasks:scheduler:check
```

该命令不是纯检查：如果存在到期任务、通知或备份，会真实执行对应业务。不要把它加入第二套 Cron 或其他每分钟任务，否则会造成不必要的重复调度。

如只需要人工触发通知发布检查，可以执行 `npm run notifications:scheduler:check`。外部调度系统也可以调用 `POST /api/notifications/publish-due`，并通过 `Authorization: Bearer <NOTIFICATION_SCHEDULER_SECRET>` 鉴权；未单独配置通知密钥时会回退使用 `TASK_SCHEDULER_SECRET`。

新的 Mac 正式部署不要再执行 `npm run tasks:scheduler:install`。该命令只为旧部署保留，会安装旧的 `com.canyin.task-scheduler`；Setup 会停用旧服务并统一改用 `com.canyin.scheduler`，避免两个调度器同时运行。

### 9. 版本升级和部署修复

普通页面或业务代码升级也建议从 Setup 的“检查升级并修复部署”入口完成，以便重新绑定正确的代码路径并执行健康检查。生产环境推荐以下顺序：

1. 如果系统已经配置数据库备份，确认最近一次备份成功；未配置时应根据数据重要性决定是否先人工导出数据库，并选择业务低峰时间；
2. 停止旧调度器，防止升级过程中触发新任务或备份；
3. 停止旧主站，避免数据库结构变更时仍有用户写入；
4. 原地更新代码，保留 `.env`、`config/`、`data/` 和数据库；
5. 重新安装依赖并生成生产构建；
6. 启动 Setup，点击“检查升级并修复部署”；
7. 等待可选的升级前备份、数据库迁移、配置同步、LaunchAgent 重装和健康检查全部成功。

对应命令如下：

```bash
launchctl bootout "gui/$(id -u)/com.canyin.scheduler"
launchctl bootout "gui/$(id -u)/com.canyin.web"

# 在此处原地更新项目代码，但保留 .env、config/ 和 data/
npm install
npm run build
npm run setup
```

某个服务原本未加载时，`launchctl bootout` 可能提示找不到服务，可以继续后续步骤。升级/修复模式会自动：

- 已配置数据库备份时，在任何数据库迁移之前创建并上传一份全量备份；尚未配置时明确显示“已跳过”，但不会阻塞升级；
- 按文件名顺序执行 `prisma/deploy-migrations/*.sql` 中尚未应用的迁移；
- 校验已执行迁移的 SHA-256，发现历史文件被修改时拒绝继续；
- 同步超级管理员权限、必要数据字典和本地配置目录；
- 根据当前项目目录、Node.js 路径和应用端口重新生成 LaunchAgent；
- 重启服务并执行健康检查。

迁移失败时不要直接删除 `DeploymentMigration` 记录，也不要修改已经发布的 SQL 后反复执行。MySQL 的部分 DDL 不能整体回滚，应保留页面错误和日志，检查升级前备份，并由开发人员判断修复迁移或恢复数据库。

#### 后续开发时的部署维护规则

- 只修改 React 页面、接口内部逻辑或样式，且没有新增环境变量、数据库结构或必要基础数据时，通常不需要修改 Setup；
- 修改 `prisma/schema.prisma` 时，必须在 `prisma/deploy-migrations/` 新增一个不可变 SQL 文件，递增 `deployment/manifest.json` 的 `databaseSchemaVersion`，更新 `databaseSchemaChecksum` 和 `latestMigration`；
- 已经发布到任何正式 Mac 的迁移文件绝对不能修改、改名或删除，只能新增更晚的迁移；
- 新增正式环境必需的变量时，要同步 `.env.example`、部署清单和 Setup 写入逻辑；
- 改变必要字典或本地配置格式时，要更新同步脚本，并按需要递增 `configSchemaVersion`；
- 新增必须由用户首次填写的第三方凭据或系统服务时，才需要调整 Setup 页面和安装流程；
- 发布前必须执行 `npm run verify:deployment` 和 `npm run build`。当前构建会在 Prisma 结构变化但部署清单未更新时主动失败。

推荐的迁移文件名格式：

```text
prisma/deploy-migrations/202609041030_add_example.sql
```

详见 [prisma/deploy-migrations/README.md](prisma/deploy-migrations/README.md)。`prisma/upgrades/` 中的旧 SQL 不属于 Setup 自动迁移目录，新的正式升级不得只把 SQL 放在那里。

### 10. 在另一台 Mac 上部署

#### 全新空系统

如果新 Mac 使用新的空数据库，不需要迁移旧业务数据，直接按照本节第 1–7 步执行。新 Mac 会拥有独立的管理员、数据库、部署状态和 LaunchAgent。

#### 搬迁已有正式系统

“搬迁已有系统”和“全新安装”不能混用。Setup 的首次安装入口会拒绝已有表的数据库，因此不能先恢复正式数据库，再把它当作新空库提交给首次安装页面。

搬迁已有数据时至少需要：

1. 在旧 Mac 的“设置 → 数据库备份”执行人工备份，确认状态为成功，并保存文件名、大小和 SHA-256；
2. 阻止用户继续写入后，依次停止旧 Mac 的调度器和主站，确保最终备份之后数据库不再变化；
3. 在新 MySQL 实例恢复该备份；
4. 安全复制旧部署的 `.env`、`config/` 和 `data/`，尤其是 `data/deployment/install-state.json` 与 `data/R2_Bucket/cloudflare_R2.json`；
5. 保留原 `R2_CONFIG_ENCRYPTION_KEY`，否则恢复后的数据库和 R2 配置中的加密凭据无法解密；
6. 如果新 Mac 的数据库账号或路径不同，只修改 `.env` 中对应连接参数，不要重新生成 R2 加密密钥；
7. 在新 Mac 执行 `npm install`、`npm run build`、`npm run setup`，进入“检查升级并修复部署”；
8. 新 Mac 验证通过后再投入使用，并确认旧 Mac 的两个 LaunchAgent 已停用。

数据库备份的校验和恢复命令见 [prisma/upgrades/README-database-backups.md](prisma/upgrades/README-database-backups.md)。数据库备份只包含 MySQL 数据，不包含 `.env`、R2 解密密钥或本地配置，因此不能只保存 `.sql.gz` 就认为已经具备完整迁移条件。

### 11. 常见问题

| 现象 | 处理方式 |
| --- | --- |
| Setup 页面提示访问令牌无效 | Setup 已重启或打开了旧标签页。关闭旧页面，重新执行 `npm run setup`，使用终端新输出的完整地址。 |
| `127.0.0.1:3210` 无法监听 | 可能已有一个 Setup 进程。回到旧终端按 Control+C；也可用 `lsof -nP -iTCP:3210 -sTCP:LISTEN` 查找占用进程。 |
| 应用端口被占用 | 返回表单换一个空闲端口。日后配置 R2 浏览器直传时，应使用最终确定的端口设置 CORS 来源。 |
| 找不到 `mysql` | 确认 MySQL 客户端已安装，修正终端 `PATH`，或通过 `MYSQL_BIN="/绝对路径/mysql" npm run setup` 启动。 |
| 找不到 `mysqldump` | 在页面填写 `mysqldump` 或 `mariadb-dump` 的绝对路径，并确认当前用户具有执行权限。 |
| 数据库连接成功但建表失败 | 应用数据库账号缺少目标库的 DDL 权限；补充权限后重新运行 Setup。 |
| 提示数据库不是空库 | Setup 为保护数据主动停止。新安装应更换空数据库；已有系统应走备份恢复和搬迁流程。 |
| LaunchAgent 已加载但网页打不开 | 查看 `data/logs/web.error.log`，确认项目没有移动、`.next/BUILD_ID` 存在、Node.js 路径有效，然后重新运行 Setup 的升级/修复。 |
| 调度日志长期为空 | 没有到期工作时不会输出日志。先用 `launchctl print` 确认服务已加载，再到系统页面查看计划和最近执行记录。 |
| 登录前网站不可用 | 这是用户级 LaunchAgent 的预期行为；登录部署时使用的 macOS 用户后才会启动。 |

### 12. 停用或卸载本机服务

在不再承担主站和调度工作的 Mac 上执行：

```bash
launchctl bootout "gui/$(id -u)/com.canyin.scheduler"
launchctl bootout "gui/$(id -u)/com.canyin.web"
rm ~/Library/LaunchAgents/com.canyin.scheduler.plist
rm ~/Library/LaunchAgents/com.canyin.web.plist
```

上述操作只停用并删除当前用户的 LaunchAgent，不会删除 `.env`、项目目录、MySQL 数据库、R2 对象或业务记录。删除项目目录或数据库之前必须另行完成备份与恢复验证。

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

## 数据库全量备份

《设置》→《数据库备份》支持每日（最多三个执行时间）、每周（可多选星期）和人工即时备份。每次都会生成一个可独立恢复的 MySQL 全量 `.sql.gz` 文件并上传至所选 Cloudflare R2 存储桶，同时保存 SHA-256、文件大小、执行状态与操作日志。生产部署、环境自检和新服务器恢复步骤见 [prisma/upgrades/README-database-backups.md](prisma/upgrades/README-database-backups.md)。
