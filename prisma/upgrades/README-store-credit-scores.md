# 门店信用得分：数据库升级

本次新增品牌编码快照、门店店长用户 ID 及评分负责人用户 ID 快照。姓名快照仍是历史展示依据，用户 ID 用于稳定标识评分发生时的负责人；负责人快照列不建立外键，避免用户后续删除影响历史评分。

上线前备份 MySQL，随后执行：

```sh
npx prisma db execute --file prisma/upgrades/20260902_store_credit_scores.sql --schema prisma/schema.prisma
npx prisma generate
```

脚本不可重复执行。脚本会用历史记录关联品牌的当前编码补齐品牌编码快照；旧门店和旧评分的负责人用户 ID 保持 `NULL`，因为仅凭姓名无法可靠反推用户。门店档案重新选择店长后会保存用户 ID，新提交的前厅及门店信用评分会同步保存该 ID 快照。历史列表继续使用姓名快照，不会因为人员调整改变。
