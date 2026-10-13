# Deployment migrations

The setup assistant applies `*.sql` files in lexical filename order and records
their SHA-256 checksums in `DeploymentMigration`.

- Use a stable filename such as `202609041030_add_example.sql`.
- Never edit a migration after it has shipped; add a new one instead.
- Make data changes retry-safe whenever possible because MySQL DDL cannot always
  be rolled back as one transaction.
- Fresh databases are created from `prisma/schema.prisma` and receive the current
  baseline before later files are considered.
- `npm run deploy:migrations` and the setup repair workflow automatically run
  the idempotent labor-record reconciliation after migrations. When applying SQL
  files outside those workflows, run `npm run labor-records:backfill` afterward.
