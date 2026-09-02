# 实际营业额数据库升级

正式数据库升级前先备份数据库，然后执行：

```bash
mysql --default-character-set=utf8mb4 -u <用户> -p <数据库> < prisma/upgrades/20260901_actual_revenue.sql
npm run db:generate
```

全新或允许由 Prisma 自动同步的环境可直接执行 `npm run db:push`。升级脚本只新增实际营业额、月目标和预留日目标相关表，不修改既有业务数据。

