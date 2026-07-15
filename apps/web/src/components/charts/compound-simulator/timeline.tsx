"use client";

import { CircleHelp } from "lucide-react";
import { Fragment, useRef, useState } from "react";
import { Tooltip as UiTooltip } from "../../ui/tooltip";

type PhaseType = "contribution" | "idle" | "withdrawal" | "overlap";

export function buildTimelineSegments(
  contributionYears: number,
  withdrawalStartYear: number,
  withdrawalYears: number,
): Array<{ type: PhaseType; start: number; end: number }> {
  const withdrawalEnd = withdrawalStartYear + withdrawalYears;
  const totalYears = Math.max(contributionYears, withdrawalEnd);
  const segments: Array<{ type: PhaseType; start: number; end: number }> = [];

  for (let y = 0; y < totalYears; y++) {
    const isContrib = y < contributionYears;
    const isWithdraw = withdrawalYears > 0 && y >= withdrawalStartYear && y < withdrawalEnd;

    let type: PhaseType;
    if (isContrib && isWithdraw) type = "overlap";
    else if (isContrib) type = "contribution";
    else if (isWithdraw) type = "withdrawal";
    else type = "idle";

    const last = segments.at(-1);
    if (last && last.type === type) {
      last.end = y + 1;
    } else {
      segments.push({ type, start: y, end: y + 1 });
    }
  }

  return segments;
}

const phaseChipStyles: Record<PhaseType, string> = {
  contribution: "bg-blue-50 text-blue-800",
  idle: "bg-gray-100 text-gray-600",
  withdrawal: "bg-orange-50 text-orange-800",
  overlap: "bg-purple-50 text-purple-800",
};

const phaseLabels: Record<PhaseType, string> = {
  contribution: "積立",
  idle: "据え置き",
  withdrawal: "切り崩し",
  overlap: "積立+切り崩し",
};

export function TimelinePhaseChips({
  contributionYears,
  withdrawalStartYear,
  withdrawalYears,
  currentYear,
  currentAge,
}: {
  contributionYears: number;
  withdrawalStartYear: number;
  withdrawalYears: number;
  currentYear: number;
  currentAge?: number;
}) {
  const segments = buildTimelineSegments(contributionYears, withdrawalStartYear, withdrawalYears);
  if (segments.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-xs">
      {segments.map((seg, i) => {
        const years = seg.end - seg.start;
        const period =
          currentAge != null
            ? `${currentAge + seg.start}〜${currentAge + seg.end}歳`
            : `${currentYear + seg.start}〜${currentYear + seg.end}`;
        return (
          <Fragment key={`${seg.type}-${seg.start}`}>
            {i > 0 && <span className="text-muted-foreground/40">→</span>}
            <span
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 ${phaseChipStyles[seg.type]}`}
            >
              <span className="inline-flex items-center">
                {phaseLabels[seg.type]}
                {seg.type === "idle" && (
                  <UiTooltip
                    content="追加投資せず、既存の資産を運用のみ続ける期間"
                    aria-label="据え置きの説明"
                  >
                    <CircleHelp className="ml-0.5 h-3 w-3 text-muted-foreground/60" />
                  </UiTooltip>
                )}
              </span>
              <span className="tabular-nums">{years}年</span>
              <span className="text-muted-foreground tabular-nums">({period})</span>
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}

type DragHandle = "contribution" | "withdrawalStart" | "withdrawalEnd";

export function InteractiveTimelineBar({
  contributionYears,
  withdrawalStartYear,
  withdrawalYears,
  onContributionYearsChange,
  onWithdrawalStartYearChange,
  onWithdrawalYearsChange,
  currentAge,
}: {
  contributionYears: number;
  withdrawalStartYear: number;
  withdrawalYears: number;
  onContributionYearsChange: (v: number) => void;
  onWithdrawalStartYearChange: (v: number) => void;
  onWithdrawalYearsChange: (v: number) => void;
  currentAge?: number;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<DragHandle | null>(null);
  const [activeDrag, setActiveDrag] = useState<DragHandle | null>(null);

  const displayMax = 70;
  const currentYear = new Date().getFullYear();
  const withdrawalEnd = withdrawalStartYear + withdrawalYears;

  const yearToPercent = (year: number) => (year / displayMax) * 100;

  function getYearFromClientX(clientX: number) {
    if (!barRef.current) return 0;
    const rect = barRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(ratio * displayMax);
  }

  const segments = buildTimelineSegments(contributionYears, withdrawalStartYear, withdrawalYears);

  const barColorMap: Record<PhaseType, string> = {
    contribution: "bg-blue-700",
    withdrawal: "bg-orange-700",
    overlap: "bg-purple-700",
    idle: "bg-gray-600",
  };

  const handles: Array<{ id: DragHandle; pos: number; color: string }> = [
    { id: "contribution", pos: contributionYears, color: "bg-blue-700" },
    { id: "withdrawalStart", pos: withdrawalStartYear, color: "bg-orange-700" },
    { id: "withdrawalEnd", pos: withdrawalEnd, color: "bg-orange-700" },
  ];

  function handlePointerDown(e: React.PointerEvent) {
    if (!barRef.current) return;
    const year = getYearFromClientX(e.clientX);

    let closest = handles[0];
    for (const h of handles) {
      if (Math.abs(year - h.pos) < Math.abs(year - closest.pos)) {
        closest = h;
      }
    }

    e.preventDefault();
    barRef.current.setPointerCapture(e.pointerId);
    draggingRef.current = closest.id;
    setActiveDrag(closest.id);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    const year = getYearFromClientX(e.clientX);

    switch (draggingRef.current) {
      case "contribution":
        onContributionYearsChange(Math.max(0, Math.min(displayMax, year)));
        break;
      case "withdrawalStart":
        onWithdrawalStartYearChange(Math.max(0, Math.min(displayMax - 5, year)));
        break;
      case "withdrawalEnd": {
        const newYears = year - withdrawalStartYear;
        onWithdrawalYearsChange(Math.max(5, Math.min(displayMax - withdrawalStartYear, newYears)));
        break;
      }
    }
  }

  function handlePointerUp() {
    draggingRef.current = null;
    setActiveDrag(null);
  }

  return (
    <div className="space-y-1">
      <div
        ref={barRef}
        className={`relative h-9 w-full overflow-hidden rounded-md bg-muted select-none touch-none ${activeDrag ? "cursor-col-resize" : "cursor-pointer"}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        aria-label="タイムライン設定"
      >
        {segments.map((seg) => {
          const widthPercent = yearToPercent(seg.end - seg.start);
          const years = seg.end - seg.start;
          return (
            <div
              key={`${seg.type}-${seg.start}`}
              className={`absolute top-0 h-full flex items-center justify-center text-xs font-medium text-white ${barColorMap[seg.type]}`}
              style={{
                left: `${yearToPercent(seg.start)}%`,
                width: `${widthPercent}%`,
              }}
            >
              {widthPercent > 12 ? `${phaseLabels[seg.type]} ${years}年` : ""}
            </div>
          );
        })}
        {handles.map((h) => (
          <div
            key={h.id}
            className="absolute top-0 h-full pointer-events-none"
            style={{ left: `${yearToPercent(h.pos)}%` }}
          >
            <div
              className={`absolute -translate-x-1/2 top-0 h-full ${activeDrag === h.id ? "w-1" : "w-0.5"} ${h.color} transition-[width]`}
            />
            <div
              className={`absolute -translate-x-1/2 top-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ${activeDrag === h.id ? "h-4 w-4" : "h-3 w-3"} ${h.color} transition-[width,height]`}
            />
          </div>
        ))}
      </div>
      <div className="relative h-5 text-xs text-muted-foreground">
        <span className="absolute left-0">
          {currentAge != null ? `${currentAge}歳` : `${currentYear}年`}
        </span>
        {handles.map((h) => {
          const pct = yearToPercent(h.pos);
          if (pct < 3 || pct > 97) return null;
          return (
            <span
              key={h.id}
              className="absolute -translate-x-1/2 font-medium"
              style={{ left: `${pct}%` }}
            >
              {currentAge != null ? `${currentAge + h.pos}歳` : `${currentYear + h.pos}年`}
            </span>
          );
        })}
        <span className="absolute right-0">
          {currentAge != null ? `${currentAge + displayMax}歳` : `${currentYear + displayMax}年`}
        </span>
      </div>
      <TimelinePhaseChips
        contributionYears={contributionYears}
        withdrawalStartYear={withdrawalStartYear}
        withdrawalYears={withdrawalYears}
        currentYear={currentYear}
        currentAge={currentAge}
      />
    </div>
  );
}
