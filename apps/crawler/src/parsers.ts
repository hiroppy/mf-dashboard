export function parseJapaneseNumber(str: string): number {
  if (!str) return 0;

  const isNegative = str.includes("-") || str.includes("−") || str.includes("▲");

  // Handle "億" and "万" units (e.g., "1億9233万" → 192330000)
  let total = 0;
  let remaining = str.replace(/[¥,$,\s円+\-−▲]/g, "");

  // Extract 億 (100 million)
  const okuMatch = remaining.match(/(\d+(?:\.\d+)?)億/);
  if (okuMatch) {
    total += parseFloat(okuMatch[1]) * 100000000;
    remaining = remaining.replace(/\d+(?:\.\d+)?億/, "");
  }

  // Extract 万 (10 thousand)
  const manMatch = remaining.match(/(\d+(?:\.\d+)?)万/);
  if (manMatch) {
    total += parseFloat(manMatch[1]) * 10000;
    remaining = remaining.replace(/\d+(?:\.\d+)?万/, "");
  }

  // If we found 億 or 万, return the total
  if (okuMatch || manMatch) {
    // Add any remaining digits (less than 万)
    const remainingNum = parseInt(remaining.replace(/\D/g, ""), 10);
    if (Number.isFinite(remainingNum)) {
      total += remainingNum;
    }
    const rounded = Math.round(total);
    return isNegative ? -rounded : rounded;
  }

  // No 億/万 units - parse as plain number
  // Check for sign prefix
  const cleaned = str.replace(/[¥,$\s円+\-−▲]/g, "");
  const value = parseInt(cleaned, 10);
  return Number.isFinite(value) ? (isNegative ? -value : value) : 0;
}

// Parse number preserving decimals (for unit prices that may have decimal values)
export function parseDecimalNumber(str: string): number {
  if (!str) return 0;
  const isNegative = str.includes("-") || str.includes("−") || str.includes("▲");
  const cleaned = str.replace(/[¥,$\s円+\-−▲]/g, "");
  const value = parseFloat(cleaned);
  return Number.isFinite(value) ? (isNegative ? -value : value) : 0;
}

export function parsePercentage(str: string): number | undefined {
  if (!str) return undefined;
  const isNegative = str.includes("-") || str.includes("−") || str.includes("▲");
  // Remove percentage symbol and parse
  const cleaned = str.replace(/[%％\s+\-−▲]/g, "");
  const value = parseFloat(cleaned);
  return isNaN(value) ? undefined : isNegative ? -value : value;
}

export function calculateChange(current: string, previous: string): string {
  const currentNum = parseJapaneseNumber(current);
  const previousNum = parseJapaneseNumber(previous);

  if (isNaN(currentNum) || isNaN(previousNum)) {
    return "-";
  }

  const diff = currentNum - previousNum;
  const sign = diff >= 0 ? "+" : "";
  return `${sign}¥${diff.toLocaleString()}`;
}

export function convertDateToIso(dateStr: string, year: number): string {
  if (!dateStr) return "";

  // すでに ISO 形式の場合はそのまま返す
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr;
  }

  // "01/22(木)" or "01/22" パターン
  const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})/);
  if (match) {
    const month = match[1].padStart(2, "0");
    const day = match[2].padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return dateStr;
}
