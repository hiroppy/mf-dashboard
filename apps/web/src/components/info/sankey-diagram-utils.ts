export function calculateFlowPercentage(value: number, totalFlow: number): string {
  if (totalFlow === 0) return "0";

  return ((value / totalFlow) * 100).toFixed(0);
}
