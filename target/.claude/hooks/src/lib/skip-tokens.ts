import * as fs from "node:fs";
import * as path from "node:path";
import { getWorkflowStateDir } from "../../../../.pi/extensions/workflow/storage";

type ClaudeSkipToken = {
  gate: string;
  workflowId: string;
  reason: string;
  issuedAt: number;
  expiresAt: number;
};

const SKIP_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes, matching gates.ts's in-memory token TTL

function skipTokensPath(): string {
  return path.join(getWorkflowStateDir(), "claude-skip-tokens.json");
}

function readTokens(now: number): ClaudeSkipToken[] {
  try {
    const raw = fs.readFileSync(skipTokensPath(), "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((token: ClaudeSkipToken) => token.expiresAt > now);
  } catch {
    return [];
  }
}

function writeTokens(tokens: ClaudeSkipToken[]): void {
  const file = skipTokensPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(tokens, null, 2), "utf-8");
}

export function addClaudeSkipToken(gate: string, workflowId: string, reason: string): void {
  const now = Date.now();
  const tokens = readTokens(now);
  tokens.push({ gate, workflowId, reason, issuedAt: now, expiresAt: now + SKIP_TOKEN_TTL_MS });
  writeTokens(tokens);
}

export function consumeClaudeSkipToken(gate: string, workflowId: string): { reason: string } | null {
  const now = Date.now();
  const tokens = readTokens(now);
  const index = tokens.findIndex((token) => token.gate === gate && token.workflowId === workflowId);
  if (index < 0) {
    writeTokens(tokens);
    return null;
  }
  const [token] = tokens.splice(index, 1);
  writeTokens(tokens);
  return { reason: token.reason };
}
