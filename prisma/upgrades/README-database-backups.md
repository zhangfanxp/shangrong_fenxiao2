# 数据库全量备份：部署与恢复

## 部署

1. 在部署主机安装与 MySQL 服务端版本兼容的 `mysqldump`（MariaDB 可使用 `mariadb-dump`），并确认运行应用的系统用户可以执行该命令。如果命令不在 `PATH`，在 `.env` 中设置 `MYSQLDUMP_BIN` 的绝对路径。
2. 当前 Setup 创建的新数据库已经包含备份相关结构，不需要人工执行 SQL。只有尚未纳入 Setup 管理的旧数据库，才需要执行一次旧版增量 SQL 并重新生成 Prisma Client：

   ```sh
   npx prisma db execute --file prisma/upgrades/20260903_database_backups.sql --schema prisma/schema.prisma
   npx prisma generate
   ```

3. 给需要使用此页面的角色配置“数据库备份”的查询、定时设置、手动备份、下载、删除权限。超级管理员的 `*` 权限无需调整。
4. 确保所选 R2 API 凭证拥有对应存储桶的对象读写权限。系统会使用分片上传，并在完成后核对对象大小与 SHA-256 元数据。
5. 自动备份由现有每分钟调度器执行。Mac 使用 Setup 安装的 `com.canyin.scheduler`，不需要再执行 `npm run tasks:scheduler:install`；其他服务器应每分钟运行一次 `npm run tasks:scheduler:check`，也可单独运行 `npm run backups:scheduler:check`。

上线前可运行 `npm run verify:database-backup`。该命令会用与正式备份相同的参数生成一次临时全量备份、计算校验值并立即清理，不会上传至R2或新增备份记录。

每个备份都是独立的 MySQL 逻辑全量备份，包含数据库建库语句、表结构、全部行数据、视图、触发器、存储过程和事件，并采用 gzip 压缩。备份不依赖早期备份文件，不包含 MySQL 服务器级账号、权限和 `mysql` 系统库。

## 在新服务器恢复

1. 安装兼容版本的 MySQL，创建具备建库权限的恢复账号；暂停新版应用写入。
2. 在《设置》→《数据库备份》中下载状态为“成功”的 `.sql.gz` 文件，并校验 SHA-256（列表中悬停文件名可查看）：

   ```sh
   shasum -a 256 canyin_mysql_full_*.sql.gz
   ```

3. 文件内包含 `CREATE DATABASE` 和 `USE`，可直接恢复到空白 MySQL 实例：

   ```sh
   gzip -dc canyin_mysql_full_*.sql.gz | mysql -h 127.0.0.1 -P 3306 -u root -p
   ```

4. 将新部署应用的 `DATABASE_URL` 指向恢复后的数据库，执行 `npx prisma generate`，启动应用后核对关键表记录数与登录、附件、任务等核心流程。若要让恢复后的系统继续访问原R2文件，还需安全迁移原部署的 `R2_CONFIG_ENCRYPTION_KEY` 与 `data/r2-storage-config.json`；它们属于应用密钥/配置，不会写入数据库备份文件。

建议定期在隔离环境进行恢复演练。只有实际完成恢复校验，才能证明数据库账号权限、`mysqldump` 版本和目标 MySQL 版本在当前部署环境中完全兼容。
