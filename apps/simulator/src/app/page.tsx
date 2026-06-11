import { CompoundSimulator } from "@web/components/charts/compound-simulator/compound-simulator";
import { AtSign, Code2 } from "lucide-react";

export default function Page() {
  return (
    <main className="min-h-screen bg-background p-4 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">資産切り崩しシミュレーター</h1>
          <div className="flex items-center gap-3 text-muted-foreground">
            <a
              href="https://x.com/about_hiroppy"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X (Twitter)"
              className="hover:text-foreground"
            >
              <AtSign size={20} />
            </a>
            <a
              href="https://github.com/hiroppy/mf-dashboard"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              className="hover:text-foreground"
            >
              <Code2 size={20} />
            </a>
          </div>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          毎月の積立額や初期投資額、運用期間などの条件から、目標金額までの道のりをシミュレーションできます。
          年齢を入力すると年金受給などを考慮した将来設計がしやすくなり、さらに5,000回のモンテカルロ・シミュレーションによって資産が枯渇する確率も算出します。
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          入力されたデータは外部に送信されず、すべてブラウザ上で計算されます。
        </p>
        <div className="mt-6">
          <CompoundSimulator />
        </div>
      </div>
    </main>
  );
}
