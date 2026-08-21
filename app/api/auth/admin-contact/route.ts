import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { maskPhone } from "@/lib/format";
export async function GET() { const admin = await db.user.findUnique({ where: { username: "admin" }, select: { phone: true } }); return NextResponse.json({ phone: maskPhone(admin?.phone) }); }
