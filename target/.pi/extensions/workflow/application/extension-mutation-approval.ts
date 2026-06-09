import type { WorkflowRuntimeState } from "../runtime-state";
import { formatExtensionMutationApprovalReason, requiresExtensionMutationApproval } from "../runtime-policy";

export type ExtensionMutationApprovalContext = {
  hasUI?: boolean;
  ui: {
    select?: (message: string, choices: string[]) => Promise<string>;
    confirm: (title: string, message: string) => Promise<boolean>;
  };
};

export async function ensureExtensionMutationApproved(
  state: WorkflowRuntimeState,
  toolName: string,
  input: unknown,
  ctx: ExtensionMutationApprovalContext,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!requiresExtensionMutationApproval(toolName, input)) return { ok: true };
  const currentWorkflowId = state.workflow?.id ?? "no-workflow";
  if (state.extensionMutationApprovedForWorkflowId === currentWorkflowId) return { ok: true };
  const reason = formatExtensionMutationApprovalReason(toolName, input);
  if (!ctx.hasUI) {
    return { ok: false, reason: [reason, "", "대화형 사용자 승인이 필요하지만 현재 UI를 사용할 수 없어 extension 수정을 차단했습니다."].join("\n") };
  }
  if (typeof ctx.ui.select === "function") {
    const choice = await ctx.ui.select(
      [reason, "", "위 harness extension 파일 수정을 어떻게 처리하시겠습니까?"].join("\n"),
      [
        "예 — 이번만 허용",
        "예 — 이번 워크플로우에서 계속 허용",
        "아니오",
      ],
    );
    if (choice === "예 — 이번 워크플로우에서 계속 허용") {
      state.extensionMutationApprovedForWorkflowId = currentWorkflowId;
      return { ok: true };
    }
    if (choice === "예 — 이번만 허용") return { ok: true };
    return { ok: false, reason: "Harness extension modification blocked: user did not approve this tool call." };
  }

  const approved = await ctx.ui.confirm(
    "Harness extension 수정 승인 확인",
    [reason, "", "이번 tool call에서만 harness extension 파일 수정을 허용하시겠습니까?"].join("\n"),
  );
  return approved ? { ok: true } : { ok: false, reason: "Harness extension modification blocked: user did not approve this tool call." };
}
