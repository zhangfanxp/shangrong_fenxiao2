import { PrismaClient, CooperationType, ContractStatus, StoreOperationStatus, TaskRecordStatus, TaskType, UserType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { synchronizeFixedSystemRoles } from "../lib/system-role-sync";
import { DEFAULT_LABOR_COST_POLICY, nextMonthText } from "../lib/personnel-labor-costs";

const prisma = new PrismaClient();

async function main() {
  const roles = await synchronizeFixedSystemRoles(prisma);
  const role = roles.find(item => item.code === "SUPER_ADMIN");
  if (!role) throw new Error("超级管理员角色初始化失败");
  const passwordHash = await bcrypt.hash("Admin@123456", 12);
  await prisma.user.upsert({ where: { username: "admin" }, update: { passwordHash, realName: "系统管理员", phone: "13800138000", roleId: role.id, type: UserType.SYSTEM }, create: { username: "admin", passwordHash, realName: "系统管理员", phone: "13800138000", roleId: role.id, type: UserType.SYSTEM } });
  const initialPolicyMonth = nextMonthText();
  const previousPolicy = await prisma.laborCostPolicyVersion.findFirst({ where: { effectiveMonth: { lte: initialPolicyMonth } }, orderBy: { effectiveMonth: "desc" } });
  await prisma.laborCostPolicyVersion.upsert({
    where: { effectiveMonth: initialPolicyMonth },
    update: {},
    create: {
      effectiveMonth: initialPolicyMonth,
      ...(previousPolicy ? {
        headquartersMonthlyRestRule: previousPolicy.headquartersMonthlyRestRule,
        headquartersFixedRestDays: previousPolicy.headquartersFixedRestDays,
        headquartersLegalHolidayRule: previousPolicy.headquartersLegalHolidayRule,
        storeMonthlyRestRule: previousPolicy.storeMonthlyRestRule,
        storeFixedRestDays: previousPolicy.storeFixedRestDays,
        storeLegalHolidayRule: previousPolicy.storeLegalHolidayRule,
      } : DEFAULT_LABOR_COST_POLICY),
      createdByUsername: "系统初始化",
      updatedByUsername: "系统初始化",
    },
  });
  const brands = await Promise.all([["FXE", "奋小二"], ["HJJ", "蚝家伙"], ["HMP", "禾穆婆"]].map(([code, name]) => prisma.brand.upsert({ where: { code }, update: {}, create: { code, name } })));
  await Promise.all(["实习生", "员工·一星", "员工·二星", "主管·三星", "店长·四星", "店长·五星"].map((label, sort) => prisma.dictionaryItem.upsert({ where: { type_value: { type: "POSITION_LEVEL", value: `LEVEL_${sort + 1}` } }, update: { label, sort }, create: { type: "POSITION_LEVEL", value: `LEVEL_${sort + 1}`, label, sort } })));
  const existing = await prisma.contract.count();
  if (!existing) {
    const contracts = await Promise.all([
      prisma.contract.create({ data: { recordNo: "HT2026080001", brandId: brands[0].id, storeName: "奋小二·静安店", status: ContractStatus.ACTIVE, cooperationType: CooperationType.DIRECT, ownerName: "张伟", ownerPhone: "13800010001", address: "上海市静安区南京西路", startDate: new Date("2026-01-01"), endDate: new Date("2027-12-31") } }),
      prisma.contract.create({ data: { recordNo: "HT2026080002", brandId: brands[1].id, storeName: "蚝家伙·徐汇店", status: ContractStatus.EXPIRING, cooperationType: CooperationType.FRANCHISE, ownerName: "李娜", ownerPhone: "13800010002", address: "上海市徐汇区漕溪北路", startDate: new Date("2025-09-01"), endDate: new Date("2026-09-10") } }),
    ]);
    await prisma.store.createMany({ data: [
      { recordNo: "MD2026080001", contractId: contracts[0].id, brandId: brands[0].id, name: "奋小二·静安店", operationStatus: StoreOperationStatus.OPENING, cooperationType: CooperationType.DIRECT, city: "上海市", district: "静安区", address: "南京西路 818 号", formalOpenDate: new Date("2026-02-01") },
      { recordNo: "MD2026080002", contractId: contracts[1].id, brandId: brands[1].id, name: "蚝家伙·徐汇店", operationStatus: StoreOperationStatus.TRIAL, cooperationType: CooperationType.FRANCHISE, city: "上海市", district: "徐汇区", address: "漕溪北路 398 号", trialOpenDate: new Date("2026-08-01") },
      { recordNo: "MD2026080003", brandId: brands[2].id, name: "禾穆婆·浦东店", operationStatus: StoreOperationStatus.PREPARING, cooperationType: CooperationType.DIRECT, city: "上海市", district: "浦东新区", address: "张江路 88 号" }
    ] });
    const taskTypes = [TaskType.DAILY, TaskType.WEEKLY, TaskType.MONTHLY, TaskType.TEMPORARY];
    const tasks = await Promise.all(
      ["每日开店巡检", "周运营复盘", "月度安全检查", "中秋活动准备"].map((title, index) =>
        prisma.task.create({ data: { title, type: taskTypes[index] } }),
      ),
    );
    await prisma.taskRecord.createMany({ data: tasks.map((task, index) => ({ taskId: task.id, status: index < 2 ? TaskRecordStatus.COMPLETED : TaskRecordStatus.PENDING, dueDate: new Date(), completedAt: index < 2 ? new Date() : null })) });
  }
}

main().finally(() => prisma.$disconnect());
