import { NextResponse } from "next/server";
import { assignmentStatusResponse } from "@/lib/course-assignment-responses";
export async function POST(request: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  if (action !== "enable" && action !== "disable") return NextResponse.json({ message: "操作不存在" }, { status: 404 });
  return assignmentStatusResponse(request, action, id);
}
