"use client";

import { useSearchParams } from "next/navigation";

export function LoginError() {
  const error = useSearchParams().get("error");
  if (error !== "invalid") {
    return null;
  }

  return (
    <p role="alert" className="mt-4 text-sm text-destructive">
      パスワードが正しくありません。
    </p>
  );
}
