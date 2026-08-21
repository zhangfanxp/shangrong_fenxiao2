import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({ targets: z.array(z.enum(["contracts", "stores", "tasks"])).min(1, "请至少选择一类业务数据"), confirmation: z.literal("确认清空", { errorMap: () => ({ message: "请输入“确认清空”以继续" }) }) });

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN") return NextResponse.json({ message: "当前账号暂无执行清空业务数据的权限" }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  const { targets } = parsed.data;
  await db.$transaction(async tx => {
    if (targets.includes("contracts") || targets.includes("stores")) await tx.store.deleteMany();
    if (targets.includes("contracts")) { await tx.contractRebate.deleteMany(); await tx.contract.deleteMany(); }
    if (targets.includes("tasks")) { await tx.taskRecord.deleteMany(); await tx.task.deleteMany(); }
    await tx.operationLog.create({ data: { userId: session.userId, page: "清空业务数据", action: "清空", result: "成功", detail: `已清空：${targets.join("、")}` } });
  });
  return NextResponse.json({ ok: true });
}
