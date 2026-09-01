import { assignmentStatusResponse } from "@/lib/course-assignment-responses";
export async function POST(request: Request) { return assignmentStatusResponse(request, "disable"); }
