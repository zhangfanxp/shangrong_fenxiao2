# 目标营业额数据库升级

在已执行 `20260901_actual_revenue.sql` 的数据库上执行：

```bash
npx prisma db execute --file prisma/upgrades/20260902_revenue_targets.sql --schema prisma/schema.prisma
```

该脚本扩展现有 `StoreMonthlyTarget`，不会创建第二套月目标数据；历史月目标会从关联的实际营业额、门店和品牌资料补齐快照、编号与来源字段。

升级后执行：

```bash
npm run db:generate
npm run verify:revenue-targets
```
