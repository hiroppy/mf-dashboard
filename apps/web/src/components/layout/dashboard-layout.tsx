import { Sparkles } from "lucide-react";

interface DashboardLayoutProps {
  overview: React.ReactNode;
  dailyChange?: React.ReactNode;
  assetHistory: React.ReactNode;
  cashFlow: React.ReactNode;
}

export function DashboardLayout({
  overview,
  dailyChange,
  assetHistory,
  cashFlow,
}: DashboardLayoutProps) {
  return (
    <div className="space-y-10">
      <header className="dashboard-reveal relative overflow-hidden rounded-3xl border bg-card px-6 py-8 shadow-sm sm:px-8 sm:py-10">
        <div
          aria-hidden="true"
          className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
        />
        <div className="relative max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold tracking-wide text-primary">
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
            FINANCIAL OVERVIEW
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            お金の現在地を、ひと目で。
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
            資産のバランスと日々の変化、毎月のお金の流れをまとめて確認できます。
          </p>
        </div>
      </header>

      <section
        aria-labelledby="dashboard-overview-title"
        className="dashboard-reveal dashboard-delay-1"
      >
        <div className="mb-4">
          <p className="text-xs font-semibold tracking-[0.2em] text-primary">CURRENT</p>
          <h2 id="dashboard-overview-title" className="mt-1 text-xl font-bold tracking-tight">
            資産のいま
          </h2>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">{overview}</div>
          {dailyChange}
        </div>
      </section>

      <section
        aria-labelledby="dashboard-trends-title"
        className="dashboard-reveal dashboard-delay-2"
      >
        <div className="mb-4">
          <p className="text-xs font-semibold tracking-[0.2em] text-primary">TRENDS</p>
          <h2 id="dashboard-trends-title" className="mt-1 text-xl font-bold tracking-tight">
            お金の流れ
          </h2>
        </div>
        <div className="space-y-6">
          {assetHistory}
          {cashFlow}
        </div>
      </section>
    </div>
  );
}
