"use client";

import { formatCurrency } from "../../../lib/format";
import { MetricLabel } from "../../ui/metric-label";
import { NumberField } from "../../ui/number-field";
import { Select } from "../../ui/select";
import { Slider } from "../../ui/slider";
import { Switch } from "../../ui/switch";
import type { PortfolioContext, WithdrawalMode } from "./compound-simulator-types";
import { PRODUCT_PRESETS } from "./product-presets";
import { InteractiveTimelineBar } from "./timeline";

export interface SettingsPanelProps {
  currentAge?: number;
  onCurrentAgeChange: (value: number | undefined) => void;
  contributionYears: number;
  onContributionYearsChange: (value: number) => void;
  withdrawalStartYear: number;
  onWithdrawalStartYearChange: (value: number) => void;
  withdrawalYears: number;
  onWithdrawalYearsChange: (value: number) => void;
  selectedPreset: string;
  onPresetChange: (value: string) => void;
  initialAmount: number;
  onInitialAmountChange: (value: number) => void;
  monthlyContribution: number;
  onMonthlyContributionChange: (value: number) => void;
  annualReturnRate: number;
  onAnnualReturnRateChange: (value: number) => void;
  expenseRatio: number;
  onExpenseRatioChange: (value: number) => void;
  withdrawalMode: WithdrawalMode;
  onWithdrawalModeChange: (value: WithdrawalMode) => void;
  withdrawalRate: number;
  onWithdrawalRateChange: (value: number) => void;
  fixedMonthlyWithdrawal: number;
  onFixedMonthlyWithdrawalChange: (value: number) => void;
  initialAnnualWithdrawal: number;
  initialMonthlyWithdrawal: number;
  monthlyWithdrawalForSummary: number;
  adjustedMonthlyPension: number;
  basePension: number;
  onBasePensionChange: (value: number) => void;
  pensionStartAge: number;
  onPensionStartAgeChange: (value: number) => void;
  monthlyOtherIncome: number;
  onMonthlyOtherIncomeChange: (value: number) => void;
  taxFree: boolean;
  onTaxFreeChange: (value: boolean) => void;
  inflationAdjustedWithdrawal: boolean;
  onInflationAdjustedWithdrawalChange: (value: boolean) => void;
  inflationRate: number;
  portfolioContext?: PortfolioContext;
}

export function SettingsPanel({
  currentAge,
  onCurrentAgeChange,
  contributionYears,
  onContributionYearsChange,
  withdrawalStartYear,
  onWithdrawalStartYearChange,
  withdrawalYears,
  onWithdrawalYearsChange,
  selectedPreset,
  onPresetChange,
  initialAmount,
  onInitialAmountChange,
  monthlyContribution,
  onMonthlyContributionChange,
  annualReturnRate,
  onAnnualReturnRateChange,
  expenseRatio,
  onExpenseRatioChange,
  withdrawalMode,
  onWithdrawalModeChange,
  withdrawalRate,
  onWithdrawalRateChange,
  fixedMonthlyWithdrawal,
  onFixedMonthlyWithdrawalChange,
  initialAnnualWithdrawal,
  initialMonthlyWithdrawal,
  monthlyWithdrawalForSummary,
  adjustedMonthlyPension,
  basePension,
  onBasePensionChange,
  pensionStartAge,
  onPensionStartAgeChange,
  monthlyOtherIncome,
  onMonthlyOtherIncomeChange,
  taxFree,
  onTaxFreeChange,
  inflationAdjustedWithdrawal,
  onInflationAdjustedWithdrawalChange,
  inflationRate,
  portfolioContext,
}: SettingsPanelProps) {
  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="sm:max-w-48 space-y-2">
        <MetricLabel
          title="現在の年齢"
          description="設定すると、グラフやサマリーが年齢で表示され、年金の受給設定が有効になります"
        />
        <NumberField
          value={currentAge}
          onValueChange={(v) => onCurrentAgeChange(v ?? undefined)}
          min={0}
          max={100}
          step={1}
          suffix="歳"
          aria-label="現在の年齢"
        />
      </div>
      <InteractiveTimelineBar
        contributionYears={contributionYears}
        withdrawalStartYear={withdrawalStartYear}
        withdrawalYears={withdrawalYears}
        onContributionYearsChange={onContributionYearsChange}
        onWithdrawalStartYearChange={onWithdrawalStartYearChange}
        onWithdrawalYearsChange={onWithdrawalYearsChange}
        currentAge={currentAge}
      />

      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">積立設定</h2>
        <div className="w-36">
          <Select
            options={PRODUCT_PRESETS.map((p) => ({
              value: p.value,
              label: p.label,
            }))}
            value={selectedPreset}
            onChange={onPresetChange}
            aria-label="商品プリセット"
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        <div className="space-y-2">
          <MetricLabel
            title="初期投資額"
            description="一括で投資する金額。0円でも積立のみで運用できます"
          />
          <NumberField
            value={initialAmount}
            onValueChange={(v) => onInitialAmountChange(v ?? 0)}
            min={0}
            step={10000}
            largeStep={100000}
            suffix="円"
            aria-label="初期投資額"
          />
        </div>

        <div className="space-y-2">
          <MetricLabel title="月額積立額" description="毎月定額で積み立てる金額" />
          <NumberField
            value={monthlyContribution}
            onValueChange={(v) => onMonthlyContributionChange(v ?? 0)}
            min={0}
            step={1000}
            largeStep={10000}
            suffix="円"
            aria-label="月額積立額"
            disabled={contributionYears === 0}
          />
          {portfolioContext?.monthlyContributionSource && (
            <p className="text-xs text-muted-foreground">
              {portfolioContext.monthlyContributionSource}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <MetricLabel
              title="想定利回り"
              description={
                <div className="space-y-1.5">
                  <p>配当再投資込みのトータルリターン（年率）を入力してください。</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="pb-1 text-left font-medium">指数</th>
                        <th className="pb-1 text-right font-medium">過去平均</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      <tr>
                        <td>S&amp;P500（配当込み）</td>
                        <td className="text-right">約10%</td>
                      </tr>
                      <tr>
                        <td>全世界株式（配当込み）</td>
                        <td className="text-right">約7〜8%</td>
                      </tr>
                      <tr>
                        <td>バランス型（株60/債40）</td>
                        <td className="text-right">約5〜6%</td>
                      </tr>
                      <tr>
                        <td>債券中心</td>
                        <td className="text-right">約2〜4%</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="text-xs text-muted-foreground">
                    ※過去実績であり将来を保証するものではありません
                  </p>
                </div>
              }
            />
            <span className="text-sm font-semibold text-primary">{annualReturnRate}%</span>
          </div>
          <Slider
            value={annualReturnRate}
            onValueChange={onAnnualReturnRateChange}
            min={0}
            max={15}
            step={0.5}
            aria-label="想定利回り"
            ticks={[
              { value: 0, label: "0%" },
              { value: 5, label: "5%" },
              { value: 10, label: "10%" },
              { value: 15, label: "15%" },
            ]}
          />
          {portfolioContext?.annualReturnRateSource && (
            <p className="text-xs text-muted-foreground">
              {portfolioContext.annualReturnRateSource}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <MetricLabel
              title="信託報酬"
              description={
                <div className="space-y-1.5">
                  <p>
                    投資信託の年間運用コスト。想定利回りから差し引かれて実質リターンを計算します。
                  </p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="pb-1 text-left font-medium">ファンド</th>
                        <th className="pb-1 text-right font-medium">信託報酬</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      <tr>
                        <td>eMAXIS Slim 全世界株式</td>
                        <td className="text-right">0.05775%</td>
                      </tr>
                      <tr>
                        <td>eMAXIS Slim S&amp;P500</td>
                        <td className="text-right">0.0814%</td>
                      </tr>
                      <tr>
                        <td>SBI・V・S&amp;P500</td>
                        <td className="text-right">0.0938%</td>
                      </tr>
                      <tr>
                        <td>たわらノーロード 先進国株式</td>
                        <td className="text-right">0.0989%</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="text-xs text-muted-foreground">※税込、2026年時点</p>
                </div>
              }
            />
            <span className="text-sm text-right">
              <span className="font-semibold text-primary">{expenseRatio}%</span>
              <span className="text-xs text-muted-foreground">
                （実質 {(annualReturnRate - expenseRatio).toFixed(1)}%）
              </span>
            </span>
          </div>
          <Slider
            value={expenseRatio}
            onValueChange={onExpenseRatioChange}
            min={0}
            max={3}
            step={0.01}
            aria-label="信託報酬"
            ticks={[
              { value: 0, label: "0%" },
              { value: 1, label: "1%" },
              { value: 2, label: "2%" },
              { value: 3, label: "3%" },
            ]}
          />
        </div>
      </div>

      <h2 className="text-base font-semibold">切り崩し設定</h2>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            {withdrawalMode === "rate" ? (
              <MetricLabel
                title="年間引出率"
                description={
                  <div className="space-y-1.5">
                    <p>
                      切り崩し開始時の資産 ×
                      引出率で初年度の引出額を決定し、翌年以降はインフレ率に応じて増額します（トリニティ・スタディ準拠）。
                    </p>
                    <table className="w-full text-xs">
                      <tbody>
                        <tr>
                          <td className="pr-2 text-muted-foreground">初年度</td>
                          <td>開始時資産 × 引出率</td>
                        </tr>
                        <tr>
                          <td className="pr-2 text-muted-foreground">N年目</td>
                          <td>
                            初年度額 × (1+インフレ率)
                            <sup>N</sup>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    {!taxFree && (
                      <>
                        <p className="font-medium">税金の影響</p>
                        <p>
                          設定した引出率の分を手取りとして受け取りますが、引き出す際に利益部分へ課税（20.315%）されます。税金分もポートフォリオから差し引かれるため、ポートフォリオからの実際の引出率は設定値を上回ります。
                        </p>
                        <p>
                          例: 引出率4%・利益率30%の場合
                          <br />→ 手取り4% + 税金(4%×30%×20.315%) ≈ 実質4.2%
                        </p>
                      </>
                    )}
                    <p>
                      米国株式中心・税引前が前提のため、日本では課税（20.315%）や為替リスクを考慮して3%程度に抑えると安全とされています。
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      モンテカルロの結果はインフレ調整済み（実質値）で表示
                    </p>
                  </div>
                }
              />
            ) : (
              <MetricLabel
                title="月額生活費総額"
                description={
                  <div className="space-y-1.5">
                    <p>
                      毎月の消費支出額（食費・住居費・光熱費など実際に使う金額）。税金・社会保険料は含みません。ここから年金（手取り）等を差し引いた額がポートフォリオからの取崩し額になります
                    </p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="pb-1 text-left font-medium">水準</th>
                          <th className="pb-1 text-right font-medium">独身</th>
                          <th className="pb-1 text-right font-medium">夫婦</th>
                        </tr>
                      </thead>
                      <tbody className="tabular-nums">
                        <tr>
                          <td>最低限</td>
                          <td className="text-right">12.0万</td>
                          <td className="text-right">23.9万</td>
                        </tr>
                        <tr>
                          <td>平均</td>
                          <td className="text-right">14.9万</td>
                          <td className="text-right">25.7万</td>
                        </tr>
                        <tr>
                          <td>ゆとり</td>
                          <td className="text-right">20.0万</td>
                          <td className="text-right">39.1万</td>
                        </tr>
                      </tbody>
                    </table>
                    <p className="text-xs text-muted-foreground">
                      ※総務省家計調査(2024年)・生命保険文化センター調査(2025年度)ベース
                    </p>
                  </div>
                }
              />
            )}
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                  withdrawalMode === "amount"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => onWithdrawalModeChange("amount")}
              >
                金額指定
              </button>
              <button
                type="button"
                className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                  withdrawalMode === "rate"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => onWithdrawalModeChange("rate")}
              >
                %指定
              </button>
            </div>
          </div>
          {withdrawalMode === "rate" ? (
            <>
              <NumberField
                value={withdrawalRate}
                onValueChange={(v) => onWithdrawalRateChange(v ?? 0)}
                min={0}
                max={20}
                step={0.5}
                suffix="%"
                aria-label="年間引出率"
              />
              <p className="text-xs text-muted-foreground">
                初年度年額{" "}
                <span className="font-semibold">約{formatCurrency(initialAnnualWithdrawal)}</span>（
                {formatCurrency(initialMonthlyWithdrawal)}/月）
              </p>
              {currentAge != null && (adjustedMonthlyPension > 0 || monthlyOtherIncome > 0) && (
                <p className="text-xs text-muted-foreground">
                  取崩し {formatCurrency(monthlyWithdrawalForSummary)}/月 ={" "}
                  {formatCurrency(initialMonthlyWithdrawal)} - 年金
                  {formatCurrency(adjustedMonthlyPension)}
                  {monthlyOtherIncome > 0 && <> - その他{formatCurrency(monthlyOtherIncome)}</>}
                </p>
              )}
            </>
          ) : (
            <>
              <NumberField
                value={fixedMonthlyWithdrawal}
                onValueChange={(v) => onFixedMonthlyWithdrawalChange(v ?? 0)}
                min={0}
                step={10000}
                largeStep={50000}
                suffix="円"
                aria-label="月額生活費総額"
              />
              <p className="text-xs text-muted-foreground">
                年額 {formatCurrency(fixedMonthlyWithdrawal * 12)}
              </p>
              {currentAge != null && (adjustedMonthlyPension > 0 || monthlyOtherIncome > 0) && (
                <p className="text-xs font-medium text-muted-foreground">
                  取崩し{" "}
                  {formatCurrency(
                    Math.max(
                      fixedMonthlyWithdrawal - adjustedMonthlyPension - monthlyOtherIncome,
                      0,
                    ),
                  )}
                  /月 = {formatCurrency(fixedMonthlyWithdrawal)} - 年金
                  {formatCurrency(adjustedMonthlyPension)}
                  {monthlyOtherIncome > 0 && <> - その他{formatCurrency(monthlyOtherIncome)}</>}
                </p>
              )}
            </>
          )}
        </div>
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <MetricLabel
                title="年金月額(65歳基準)"
                description="税引前の額面額を入力してください。手取り率85%を自動適用します。厚生年金の平均受給額は約14.6万円/月、国民年金のみの場合は約5.8万円/月が目安です（厚生労働省統計）"
              />
              <div className="flex items-center gap-1">
                {[
                  {
                    type: "single" as const,
                    label: "独身",
                    pension: 146_000,
                  },
                  {
                    type: "couple" as const,
                    label: "夫婦",
                    pension: 292_000,
                  },
                ].map(({ type, label, pension }) => (
                  <button
                    key={type}
                    type="button"
                    disabled={currentAge == null}
                    onClick={() => onBasePensionChange(pension)}
                    className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      basePension === pension
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <NumberField
              value={basePension}
              onValueChange={(v) => onBasePensionChange(v ?? 0)}
              min={0}
              step={10000}
              largeStep={50000}
              suffix="円"
              aria-label="年金月額(65歳基準)"
              disabled={currentAge == null}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <MetricLabel
                title="受給開始年齢"
                description={
                  <div className="space-y-1">
                    <p>繰上げ（60〜64歳）: 月あたり -0.4%</p>
                    <p>繰下げ（66〜75歳）: 月あたり +0.7%</p>
                    <p>65歳が標準受給開始年齢です</p>
                  </div>
                }
              />
              <span className="text-sm font-semibold text-primary">{pensionStartAge}歳</span>
            </div>
            <Slider
              value={pensionStartAge}
              onValueChange={onPensionStartAgeChange}
              min={60}
              max={75}
              step={1}
              aria-label="受給開始年齢"
              disabled={currentAge == null}
              ticks={[
                { value: 60, label: "60歳" },
                { value: 65, label: "65歳" },
                { value: 70, label: "70歳" },
                { value: 75, label: "75歳" },
              ]}
            />
          </div>
          {currentAge == null ? (
            <p className="text-xs text-destructive">年齢を設定すると年金が有効になります</p>
          ) : (
            <p className="text-xs font-medium text-muted-foreground">
              手取り {formatCurrency(adjustedMonthlyPension)}/月（額面の
              {Math.round((adjustedMonthlyPension / (basePension || 1)) * 100)}% 税金控除後）
            </p>
          )}
        </div>
        <div className="space-y-2">
          <MetricLabel
            title="その他の月収"
            description="パート収入、家賃収入などの手取り額。切り崩し開始時から常に適用されます"
          />
          <NumberField
            value={monthlyOtherIncome}
            onValueChange={(v) => onMonthlyOtherIncomeChange(v ?? 0)}
            min={0}
            step={10000}
            largeStep={50000}
            suffix="円"
            aria-label="その他の月収"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-3">
          <Switch
            checked={!taxFree}
            onCheckedChange={(v) => onTaxFreeChange(!v)}
            aria-label="税金を含めて計算"
          />
          <MetricLabel
            title="税金を含めて計算"
            description="運用益にかかる税金（20.315%）を含めてシミュレーション"
          />
        </div>
        {withdrawalMode === "amount" && (
          <div className="flex items-center gap-3">
            <Switch
              checked={inflationAdjustedWithdrawal}
              onCheckedChange={onInflationAdjustedWithdrawalChange}
              aria-label="引出額を物価上昇に連動"
            />
            <MetricLabel
              title="引出額を物価上昇に連動"
              description={
                <div className="space-y-1">
                  <p>
                    ONにすると、引出額が毎年インフレ率（{inflationRate}
                    %）分だけ増額され、購買力を維持します。
                  </p>
                  <p>OFFの場合、引出額は名目で固定され、実質的な購買力は年々低下します。</p>
                </div>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
