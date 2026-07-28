export function removeHiddenHtmlElements(text: string): string {
  return text.replace(
    /<([a-z][\w-]*)\b(?=[^>]*(?:\shidden(?:\s*=\s*["']?hidden["']?)?(?=\s|>)|\saria-hidden\s*=\s*["']?true|\sstyle\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)))[^>]*>[\s\S]*?<\/\1>/gi,
    "",
  );
}
