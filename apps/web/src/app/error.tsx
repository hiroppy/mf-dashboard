"use client";

import Image from "next/image";
import { Card, CardContent } from "../components/ui/card";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-lg w-full">
        <CardContent className="text-center py-12 space-y-5">
          <Image
            src="/cry.png"
            alt="エラーが発生しました"
            width={120}
            height={120}
            className="mx-auto mb-4 rounded-full"
          />
          <h1 className="text-2xl font-bold text-foreground">エラーが発生しました</h1>
          <p className="text-muted-foreground">
            データの読み込み中にエラーが発生しました。データベースが正しく設定されているか確認してください。
          </p>
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            再試行
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
