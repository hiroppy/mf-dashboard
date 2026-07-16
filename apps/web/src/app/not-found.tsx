import Image from "next/image";
import Link from "next/link";
import { Card, CardContent } from "../components/ui/card";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-lg w-full">
        <CardContent className="text-center py-12 space-y-5">
          <Image
            src="/cry.png"
            alt="ページが見つかりません"
            width={120}
            height={120}
            className="mx-auto mb-4 rounded-full"
          />
          <h1 className="text-2xl font-bold text-foreground">ページが見つかりません</h1>
          <p className="text-muted-foreground">
            お探しのページは存在しないか、移動した可能性があります。
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            ダッシュボードに戻る
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
