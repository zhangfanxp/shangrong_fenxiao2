# 登录与仪表板性能索引

本次升级为登录后的仪表板统计补充三个索引。部署前先备份数据库，并在目标库确认不存在同名或等价索引。

```sh
npx prisma db execute --file prisma/upgrades/20260901_login_dashboard_performance.sql --schema prisma/schema.prisma
npx prisma generate
```

脚本只创建索引，不修改或删除业务数据；MySQL 建索引期间可能占用额外 I/O，建议在低峰期执行。脚本不可重复执行。

对应查询：

- `User(lastLoginAt)`：今日登录用户数；
- `Contract(status, endDate)`：近效期、逾期合同数；
- `TaskRecord(status, taskId)`：已完成任务按任务汇总。

执行后可使用 `EXPLAIN` 确认生产库选择了新索引。小数据量时优化器仍可能选择全表扫描，这是正常现象。
