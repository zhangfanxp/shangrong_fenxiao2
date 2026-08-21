import { NextResponse } from "next/server";
import { R2ConfigError } from "@/lib/r2-config-service";

export function r2ErrorResponse(error: unknown, fallback: string) {
  if (error instanceof R2ConfigError) {
    const status = error.code === "not-found" ? 404 : error.code === "file" ? 500 : error.code === "incomplete" ? 400 : 409;
    return NextResponse.json({ message: error.message }, { status });
  }
  return NextResponse.json({ message: fallback }, { status: 500 });
}
