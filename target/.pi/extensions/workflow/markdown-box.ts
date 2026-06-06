import { truncateToWidth } from "@earendil-works/pi-tui";

export const DEFAULT_SEMANTIC_BOX_TYPES = [
  "note",
  "warning",
  "error",
  "plan",
  "review",
  "decision",
  "tip",
] as const;

export const KNOWN_CODE_LANGUAGES = new Set([
  "bash",
  "c",
  "cpp",
  "csharp",
  "css",
  "diff",
  "dockerfile",
  "go",
  "html",
  "java",
  "javascript",
  "js",
  "json",
  "jsx",
  "kotlin",
  "markdown",
  "md",
  "mermaid",
  "php",
  "plaintext",
  "powershell",
  "ps1",
  "py",
  "python",
  "rb",
  "ruby",
  "rust",
  "rs",
  "sh",
  "shell",
  "sql",
  "swift",
  "text",
  "toml",
  "ts",
  "tsx",
  "typescript",
  "xml",
  "yaml",
  "yml",
]);

export interface SemanticMarkdownBoxOptions {
  additionalBoxTypes?: string[];
}

export type FenceClassification = "code" | "box" | "plain";

export interface SemanticMarkdownSegment {
  kind: "text" | "code" | "box";
  info?: string;
  boxType?: string;
  fence?: "```" | "~~~";
  text: string;
  raw?: string;
}

export const SEMANTIC_BOX_LABELS: Record<string, string> = {
  note: "Note",
  warning: "Warning",
  error: "Error",
  plan: "Plan",
  review: "Review",
  decision: "Decision",
  tip: "Tip",
};

export const SEMANTIC_BOX_COLOR_KINDS: Record<string, string> = {
  note: "accent",
  warning: "warning",
  error: "error",
  plan: "accent",
  review: "success",
  decision: "accent",
  tip: "success",
};

const BOX_ICONS: Record<string, string> = {
  note: "ℹ",
  warning: "⚠",
  error: "✖",
  plan: "◇",
  review: "✓",
  decision: "◆",
  tip: "💡",
};

export function classifyFenceInfo(info: string | undefined, options: SemanticMarkdownBoxOptions = {}): FenceClassification {
  const token = normalizeInfoToken(info);
  if (!token) return "plain";
  if (KNOWN_CODE_LANGUAGES.has(token)) return "code";
  if ((DEFAULT_SEMANTIC_BOX_TYPES as readonly string[]).includes(token)) return "box";
  const additional = (options.additionalBoxTypes ?? []).map((item) => normalizeInfoToken(item)).filter(Boolean);
  if (additional.includes(token)) return "box";
  return "box";
}

export function parseMarkdownFencedBlocks(text: string, options: SemanticMarkdownBoxOptions = {}): SemanticMarkdownSegment[] {
  const lines = text.split(/\r?\n/);
  const segments: SemanticMarkdownSegment[] = [];
  let textBuffer: string[] = [];

  const flushText = () => {
    if (textBuffer.length === 0) return;
    segments.push({ kind: "text", text: textBuffer.join("\n") });
    textBuffer = [];
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const open = line.match(/^\s*(```|~~~)\s*([^`]*)\s*$/);
    if (!open) {
      textBuffer.push(line);
      continue;
    }

    const fence = open[1] as "```" | "~~~";
    const info = (open[2] ?? "").trim();
    const body: string[] = [];
    let closeIndex = -1;
    for (let cursor = index + 1; cursor < lines.length; cursor++) {
      if (lines[cursor].trim() === fence) {
        closeIndex = cursor;
        break;
      }
      body.push(lines[cursor]);
    }

    if (closeIndex < 0) {
      textBuffer.push(line);
      continue;
    }

    flushText();
    const classification = classifyFenceInfo(info, options);
    const raw = [line, ...body, lines[closeIndex]].join("\n");
    const normalized = normalizeInfoToken(info);
    segments.push({
      kind: classification === "box" ? "box" : "code",
      info,
      boxType: classification === "box" ? normalized : undefined,
      fence,
      text: body.join("\n"),
      raw,
    });
    index = closeIndex;
  }

  flushText();
  return segments;
}

export function renderSemanticMarkdownBoxes(
  text: string,
  width: number,
  theme?: unknown,
  options: SemanticMarkdownBoxOptions = {},
): string[] {
  const safeWidth = Math.max(1, width);
  const lines: string[] = [];
  for (const segment of parseMarkdownFencedBlocks(text, options)) {
    if (segment.kind === "box") {
      lines.push(...renderBoxSegment(segment, safeWidth, theme));
      continue;
    }
    if (segment.kind === "code" && segment.raw) {
      lines.push(...segment.raw.split("\n").map((line) => fitLine(line, safeWidth)));
      continue;
    }
    lines.push(...segment.text.split("\n").map((line) => fitLine(line, safeWidth)));
  }
  return lines;
}

function renderBoxSegment(segment: SemanticMarkdownSegment, width: number, theme?: unknown): string[] {
  const boxType = segment.boxType || "note";
  const label = SEMANTIC_BOX_LABELS[boxType] ?? titleCase(boxType);
  const icon = BOX_ICONS[boxType] ?? "□";
  const innerWidth = Math.max(1, width - 4);
  const border = fitLine(`╭${"─".repeat(Math.max(0, width - 2))}╮`, width);
  const bottom = fitLine(`╰${"─".repeat(Math.max(0, width - 2))}╯`, width);
  const title = colorize(theme, boxType, `${icon} ${label}`);
  const rendered = [border, fitLine(`│ ${title.padEnd(innerWidth)} │`, width)];
  for (const bodyLine of segment.text.split("\n")) {
    const chunks = wrapPlainLine(bodyLine, innerWidth);
    for (const chunk of chunks) {
      rendered.push(fitLine(`│ ${chunk.padEnd(innerWidth)} │`, width));
    }
  }
  rendered.push(bottom);
  return rendered;
}

function normalizeInfoToken(info: string | undefined): string {
  return String(info ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

function titleCase(value: string): string {
  return value.split(/[-_]/).filter(Boolean).map((part) => part.slice(0, 1).toUpperCase() + part.slice(1)).join(" ");
}

function wrapPlainLine(value: string, width: number): string[] {
  if (!value) return [""];
  const chunks: string[] = [];
  let remaining = value;
  while (remaining.length > width) {
    chunks.push(remaining.slice(0, width));
    remaining = remaining.slice(width);
  }
  chunks.push(remaining);
  return chunks;
}

function fitLine(value: string, width: number): string {
  return truncateToWidth(value, width, "");
}

function colorize(theme: unknown, boxType: string, value: string): string {
  const colorKind = SEMANTIC_BOX_COLOR_KINDS[boxType] ?? "accent";
  const maybeTheme = theme as { fg?: (kind: string, text: string) => string } | undefined;
  if (typeof maybeTheme?.fg !== "function") return value;
  return maybeTheme.fg(colorKind, value);
}
