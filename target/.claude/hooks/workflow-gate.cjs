#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// target/.claude/hooks/src/workflow-gate.ts
var fs4 = __toESM(require("node:fs"));

// target/.pi/extensions/workflow/state.ts
var fs2 = __toESM(require("node:fs"));

// target/.pi/extensions/workflow/types.ts
var WORKFLOW_PHASES = [
  "interview",
  "plan",
  "plan_review",
  "implement",
  "code_review",
  "review_approved",
  "document",
  "commit",
  "push",
  "done"
];
var LEGACY_WORKFLOW_PHASE_ALIASES = {
  push_with_review: "push"
};

// target/.pi/extensions/workflow/storage.ts
var import_node_crypto = require("node:crypto");
var os = __toESM(require("node:os"));
var path = __toESM(require("node:path"));

// target/.pi/extensions/workflow/git.ts
var import_node_child_process = require("node:child_process");
function isGitPush(cmd) {
  const normalized = cmd.replace(/'[^']*'/g, "").replace(/"[^"]*"/g, "").replace(/git\s+-C\s+\S+/g, "git");
  return /(?:^|[|;&\s])git\s+push(?:\s|$)/.test(normalized);
}
function getGitRoot() {
  try {
    return (0, import_node_child_process.execSync)("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      stdio: "pipe"
    }).trim();
  } catch {
    return null;
  }
}
function getBranch(root) {
  try {
    return (0, import_node_child_process.execSync)(`git -C "${root}" rev-parse --abbrev-ref HEAD`, {
      encoding: "utf-8",
      stdio: "pipe"
    }).trim();
  } catch {
    return "unknown";
  }
}

// target/.pi/extensions/workflow/storage.ts
function getWorkflowStateDir() {
  return path.join(getAgentDir(), "workflow-state", projectHash(getGitRoot() ?? process.cwd()));
}
function getWorkflowStatePath() {
  return path.join(getWorkflowStateDir(), "state.json");
}
function getAgentDir() {
  return process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".pi", "agent");
}
function projectHash(root) {
  return (0, import_node_crypto.createHash)("sha256").update(path.resolve(root)).digest("hex").slice(0, 16);
}

// target/.pi/extensions/workflow/gates.ts
var import_node_child_process2 = require("node:child_process");
var path4 = __toESM(require("node:path"));

// target/.pi/extensions/workflow/artifact-descriptor.ts
var DEFAULT_INLINE_ARTIFACT_THRESHOLD_BYTES = 8 * 1024;

// target/.pi/extensions/workflow/ui.ts
function banner(title) {
  const width = Math.max(36, displayWidth(title) + 2);
  return [
    `\u2554${"\u2550".repeat(width)}\u2557`,
    `\u2551 ${padDisplay(title, width - 1)}\u2551`,
    `\u255A${"\u2550".repeat(width)}\u255D`
  ].join("\n");
}
function padDisplay(value, width) {
  return value + " ".repeat(Math.max(0, width - displayWidth(value)));
}
function displayWidth(value) {
  let width = 0;
  for (const char of Array.from(value)) {
    const code = char.codePointAt(0) ?? 0;
    if (isZeroWidthCode(code)) continue;
    width += isWideCode(code) ? 2 : 1;
  }
  return width;
}
function isZeroWidthCode(code) {
  return code >= 65024 && code <= 65039 || // Variation Selectors (e.g. U+FE0F after ⚠)
  code === 8203 || // Zero Width Space
  code === 8204 || // Zero Width Non-Joiner
  code === 8205 || // Zero Width Joiner
  code >= 917760 && code <= 917999;
}
function isWideCode(code) {
  return code >= 4352 && code <= 4607 || code >= 9728 && code <= 10175 || // Misc Symbols & Dingbats (⚪✅⚠❌ 등)
  code >= 11904 && code <= 42191 || code >= 44032 && code <= 55203 || code >= 63744 && code <= 64255 || code >= 65040 && code <= 65049 || code >= 65072 && code <= 65135 || code >= 65280 && code <= 65376 || code >= 65504 && code <= 65510 || code >= 126976 && code <= 129791;
}

// target/.pi/extensions/workflow/catalog.ts
var path2 = __toESM(require("node:path"));
var HARNESS_ROOT = path2.resolve(__dirname, "../../..");
var PI_ROOT = path2.join(HARNESS_ROOT, ".pi");
var WORKFLOW_DIR = path2.join(PI_ROOT, "workflows");
var PI_EXT_ROOT = path2.resolve(__dirname, "../..");
var HARNESS_EXT_ROOT = path2.resolve(__dirname, "../../..");

// target/.pi/extensions/workflow/field-log.ts
var path3 = __toESM(require("node:path"));
var HARNESS_ROOT2 = path3.resolve(__dirname, "../../..");
var MEMORY_DIR = path3.join(".project-memory", "harness");

// target/.pi/extensions/workflow/domain/phase-template-policy.ts
function getPhaseTemplatePhases(templateName, basePhases) {
  if (templateName === "light") return basePhases.filter((phase) => phase !== "document");
  return basePhases;
}

// target/.pi/extensions/workflow/gates.ts
var HARNESS_ROOT3 = path4.resolve(__dirname, "../../..");
var PI_ROOT2 = path4.join(HARNESS_ROOT3, ".pi");
var DPAA_VENV_DIR = path4.join(PI_ROOT2, ".venv");
var CORENLP_DIR = path4.join(PI_ROOT2, "corenlp");
function validateWorkflowWorkspace(workflow) {
  const actualCwd = process.cwd();
  const actualGitRoot = getGitRoot();
  const actualBranch = actualGitRoot ? getBranch(actualGitRoot) : "unknown";
  if (!workflow) return { ok: true, actualCwd, actualGitRoot, actualBranch, problems: [] };
  const problems = [];
  if (workflow.gitRoot && actualGitRoot && path4.resolve(workflow.gitRoot) !== path4.resolve(actualGitRoot)) {
    problems.push("git root mismatch");
  }
  if (workflow.gitRoot && !actualGitRoot) {
    problems.push("current cwd is not inside a git worktree");
  }
  if (workflow.branch !== "unknown" && actualBranch !== workflow.branch) {
    problems.push("branch mismatch");
  }
  return {
    ok: problems.length === 0,
    expectedCwd: workflow.cwd,
    actualCwd,
    expectedGitRoot: workflow.gitRoot,
    actualGitRoot,
    expectedBranch: workflow.branch,
    actualBranch,
    problems
  };
}
function formatWorkspaceMismatch(validation) {
  if (validation.ok) return "";
  return formatGateBlocked({
    gate: "Workflow Workspace",
    why: `The current workspace does not match the worktree/branch where this workflow started. Problems: ${validation.problems.join(", ")}.`,
    defaultHandling: [
      "Do not try to satisfy this gate by editing files, changing workflow state, or simulating evidence.",
      "Tell the user the expected directory/branch and ask them to navigate there before continuing.",
      "Retry only after the actual workspace matches the workflow workspace."
    ],
    next: [
      "Tell the user which directory and branch this workflow started in, and ask them to navigate there before continuing",
      "Do not attempt to change directories yourself or simulate workspace state",
      "Do not proceed with implementation until the workspace matches",
      `Expected CWD: ${validation.expectedCwd ?? "unknown"} \u2014 Actual CWD: ${validation.actualCwd}`,
      `Expected branch: ${validation.expectedBranch ?? "unknown"} \u2014 Actual branch: ${validation.actualBranch}`
    ]
  });
}
var HIGH_RISK_PUSH_PATH_SEGMENTS = /* @__PURE__ */ new Set([
  "auth",
  "authentication",
  "authorization",
  "oauth",
  "password",
  "secret",
  "secrets",
  "credential",
  "credentials",
  "token",
  "tokens",
  "session",
  "sessions",
  "permission",
  "permissions",
  "security",
  "crypto",
  "encryption",
  "infra",
  "infrastructure",
  "terraform",
  "k8s",
  "kubernetes",
  "rbac",
  "iam",
  "policy",
  "policies"
]);
var HIGH_RISK_PUSH_FILENAMES = /* @__PURE__ */ new Set(["schema.prisma"]);
var HIGH_RISK_PUSH_FILENAME_PATTERNS = [
  /^\.env[^/]*$/,
  /^(docker-)?compose(\..*)?\.ya?ml$/
];
function hasHighRiskPushPath(file) {
  const segments = file.split("/").map((segment) => segment.toLowerCase()).filter(Boolean);
  const filename = segments[segments.length - 1] ?? "";
  return HIGH_RISK_PUSH_FILENAMES.has(filename) || HIGH_RISK_PUSH_FILENAME_PATTERNS.some((pattern) => pattern.test(filename)) || segments.some((segment) => HIGH_RISK_PUSH_PATH_SEGMENTS.has(segment));
}
function runGit(root, args) {
  return (0, import_node_child_process2.execFileSync)("git", ["-C", root, ...args], {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 50 * 1024 * 1024
  }).trim();
}
function parseGitNameStatus(output) {
  if (!output.trim()) return [];
  return output.split(/\r?\n/).filter(Boolean).map((line) => {
    const fields = line.split("	");
    const status = fields[0] ?? "";
    const file = (fields.at(-1) ?? "").trim().replace(/\\/g, "/");
    return { status, file };
  }).filter((entry) => entry.file.length > 0);
}
function scanOutgoingCommitEntries(root) {
  try {
    const upstream = runGit(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
    return parseGitNameStatus(runGit(root, ["diff", "--name-status", "--find-renames", `${upstream}..HEAD`]));
  } catch {
    return parseGitNameStatus(runGit(root, ["diff-tree", "--no-commit-id", "--name-status", "--find-renames", "-r", "HEAD"]));
  }
}
function scanDirtyWorkingTreeEntries(root) {
  const out = runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (!out) return [];
  return out.split(/\r?\n/).map((line) => {
    const status = line.slice(0, 2);
    const rawPath = line.slice(3).trim();
    const file = rawPath.includes(" -> ") ? rawPath.split(" -> ").pop().trim() : rawPath;
    return { status, file: file.replace(/\\/g, "/") };
  }).filter((entry) => entry.file.length > 0);
}
function pushPolicyUnavailable(limit, reason) {
  return {
    ok: false,
    totalChanged: 0,
    maxChanged: limit,
    findings: [{ category: "Push policy scan unavailable (git error)", files: [reason] }]
  };
}
function scanPushPolicy(root = getGitRoot()) {
  const maxChanged = Number.parseInt(process.env.HARNESS_POLICY_MAX_CHANGED_FILES ?? "30", 10);
  const limit = Number.isFinite(maxChanged) && maxChanged > 0 ? maxChanged : 30;
  if (!root) return pushPolicyUnavailable(limit, "No git root detected");
  let entries = [];
  try {
    entries = scanOutgoingCommitEntries(root);
    if (entries.length === 0) entries = scanDirtyWorkingTreeEntries(root);
  } catch (error) {
    return pushPolicyUnavailable(limit, error instanceof Error ? error.message : String(error));
  }
  const categories = [
    { category: "Build descriptor changed (build.gradle / pom.xml)", match: ({ file }) => /(^|\/)(build\.gradle(\.kts)?|pom\.xml)$/.test(file) },
    { category: "Application config changed (application.yml)", match: ({ file }) => /(^|\/)application\.ya?ml$/.test(file) },
    { category: "DB migration changed (db/migration)", match: ({ file }) => /(^|\/)db\/migration\//.test(file) },
    { category: "Dockerfile changed", match: ({ file }) => /(^|\/)(Dockerfile|.*\.Dockerfile)$/.test(file) },
    { category: "CI config changed", match: ({ file }) => /(^\.github\/workflows\/|^\.gitlab-ci\.ya?ml$|(^|\/)Jenkinsfile$|^azure-pipelines\.ya?ml$|^\.circleci\/|^bitbucket-pipelines\.ya?ml$)/.test(file) },
    { category: "High-risk path changed (auth/session/security/secret/schema/infra/env)", match: ({ file }) => hasHighRiskPushPath(file) },
    { category: "Deleted files", match: ({ status }) => status.includes("D") }
  ];
  const findings = categories.map(({ category, match }) => ({ category, files: entries.filter(match).map((entry) => entry.file) })).filter((finding) => finding.files.length > 0);
  if (entries.length > limit) {
    findings.push({
      category: `Excessive file changes (${entries.length} > ${limit})`,
      files: entries.slice(0, limit + 1).map((entry) => entry.file)
    });
  }
  return { ok: findings.length === 0, totalChanged: entries.length, maxChanged: limit, findings };
}
function formatPushPolicyScanBlocked(scan) {
  const sections = scan.findings.flatMap((finding) => [
    `- ${finding.category}`,
    ...finding.files.slice(0, 12).map((file) => `  \u2022 ${file}`),
    ...finding.files.length > 12 ? [`  \u2022 ... ${finding.files.length - 12} more`] : []
  ]);
  return formatGateBlocked({
    gate: "Push Policy Scan",
    why: `Risky workspace changes were detected before git push. Changed files: ${scan.totalChanged} (limit: ${scan.maxChanged}).`,
    defaultHandling: [
      "Do not silently fix or hide risky changes to make the scan pass.",
      "Present the risk summary to the user and continue only through the interactive policy approval path.",
      "If the risk is caused by accidental changes, ask before removing or splitting them."
    ],
    next: [
      "Present each flagged category to the user clearly and explain the risk",
      "Ask the user to confirm they are aware of each risky change before proceeding",
      "If the user confirms, answer yes to the confirmation prompt; if they want to cancel, answer no",
      "For non-interactive sessions only: if the user explicitly approves all risks, run `/workflow skip policy-scan <reason>` and retry git push",
      "If the file count is excessive, ask the user whether to split the change into smaller commits",
      "Flagged changes:",
      ...sections
    ],
    skip: "/workflow skip policy-scan <reason>"
  });
}
function formatGateBlocked(args) {
  const defaultHandling = args.defaultHandling ?? [
    "Do not ask the user to skip this gate.",
    "If the issue is fixable within the current workflow phase, fix the underlying cause and retry the workflow transition.",
    "Ask the user only when the fix requires product/architecture input or a workflow approval boundary."
  ];
  return [
    banner(`\u{1F6A6} ${args.gate.toUpperCase()} GATE BLOCKED`),
    "",
    "Why blocked:",
    `  ${args.why}`,
    "",
    "Default handling for the LLM:",
    ...defaultHandling.map((item, index) => `  ${index + 1}. ${item}`),
    "",
    "Next actions:",
    ...args.next.map((item, index) => `  ${index + 1}. ${item}`),
    ...args.skip ? [
      "",
      "Accepted-risk exception path:",
      "  Do not propose a gate skip proactively.",
      "  Use this only if the user independently accepts the risk or explicitly instructs a one-time exception:",
      `  ${args.skip}`
    ] : [],
    "",
    "Caution:",
    "  Do not bypass this gate unless the user has already explicitly accepted the risk."
  ].join("\n");
}

// target/.pi/extensions/workflow/policy-core.ts
var fs = __toESM(require("node:fs"));
var path5 = __toESM(require("node:path"));
var PROJECT_ROOT = path5.resolve(__dirname, "../../..");
var POLICY_FILE = path5.join(PROJECT_ROOT, ".harness", "workflow-policy.json");
var DEFAULT_POLICY = {
  schemaVersion: 1,
  phases: WORKFLOW_PHASES,
  autoAdvanceFromPhases: ["interview", "plan", "implement", "review_approved", "document"],
  approvalBoundaries: ["commit:push"],
  gates: ["dpaa", "code-quality", "policy-scan"],
  transitionPolicy: {
    strictNextPhaseOnly: true,
    forbidSkippedPhases: true,
    manualStateRestoreIsRecoveryOnly: true,
    tokenIssuanceIsNotThePolicySource: true
  },
  contextManagement: {
    mainAgentRole: "workflow-controller",
    subagentPreferredPhases: ["implement", "code_review"]
  },
  contextStrategy: {
    implement: {
      delegateTo: "worker",
      mainKeeps: ["changed files", "summary", "verification", "risks"],
      mainAvoids: ["raw logs", "large diffs", "file dumps"]
    },
    code_review: {
      delegateTo: "reviewer",
      mainKeeps: ["finding counts", "fix summary", "quality result", "blockers"],
      mainAvoids: ["full review transcript", "full logs"]
    },
    document: {
      delegateTo: "worker when documentation is large",
      mainKeeps: ["docs changed", "rationale", "verification"],
      mainAvoids: ["large copied docs", "unrelated documentation"]
    },
    commit: {
      delegateTo: "main",
      mainKeeps: ["diff summary", "verification summary", "risk summary", "commit message"],
      mainAvoids: ["raw diff", "full logs"]
    }
  },
  subagentHandoffContract: ["Summary", "Changed files", "Verification", "Risks", "Blockers", "Recommended next step"],
  reminderPolicy: {
    injectOnUserPrompt: true,
    injectBeforeAgentStart: true,
    includeCurrentPhase: true,
    includeNextPhase: true,
    includeNoSkipRule: true,
    includeSubagentGuidance: true,
    hardRules: [
      "Follow the current workflow phase.",
      "Never skip phases; only advance to the next phase.",
      "User approval is required only before implement and before push.",
      "In code_review, fix/review/quality loop stays in code_review.",
      "Use subagents for implementation, review, large diffs, and logs.",
      "Keep main context to decisions, changed files, verification, blockers, next phase."
    ]
  },
  phaseGuidance: {}
};
function asWorkflowPhaseList(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  const phases = value.filter((item) => WORKFLOW_PHASES.includes(item));
  return phases.length > 0 ? phases : fallback;
}
function stringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim().length > 0) : [];
}
function normalizeTransitionPolicy(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    strictNextPhaseOnly: typeof source.strictNextPhaseOnly === "boolean" ? source.strictNextPhaseOnly : DEFAULT_POLICY.transitionPolicy.strictNextPhaseOnly,
    forbidSkippedPhases: typeof source.forbidSkippedPhases === "boolean" ? source.forbidSkippedPhases : DEFAULT_POLICY.transitionPolicy.forbidSkippedPhases,
    manualStateRestoreIsRecoveryOnly: typeof source.manualStateRestoreIsRecoveryOnly === "boolean" ? source.manualStateRestoreIsRecoveryOnly : DEFAULT_POLICY.transitionPolicy.manualStateRestoreIsRecoveryOnly,
    tokenIssuanceIsNotThePolicySource: typeof source.tokenIssuanceIsNotThePolicySource === "boolean" ? source.tokenIssuanceIsNotThePolicySource : DEFAULT_POLICY.transitionPolicy.tokenIssuanceIsNotThePolicySource
  };
}
function normalizeContextStrategy(value) {
  if (!value || typeof value !== "object") return {};
  const result = {};
  for (const phase of WORKFLOW_PHASES) {
    const item = value[phase];
    if (!item || typeof item !== "object") continue;
    const record = item;
    const delegateTo = typeof record.delegateTo === "string" ? record.delegateTo : "";
    const mainKeeps = stringList(record.mainKeeps);
    const mainAvoids = stringList(record.mainAvoids);
    if (delegateTo || mainKeeps.length > 0 || mainAvoids.length > 0) result[phase] = { delegateTo, mainKeeps, mainAvoids };
  }
  return result;
}
var _policyCache = null;
function loadSharedWorkflowPolicy() {
  if (_policyCache) return _policyCache;
  try {
    const parsed = JSON.parse(fs.readFileSync(POLICY_FILE, "utf-8"));
    _policyCache = {
      ...DEFAULT_POLICY,
      ...parsed,
      phases: asWorkflowPhaseList(parsed.phases, DEFAULT_POLICY.phases),
      autoAdvanceFromPhases: asWorkflowPhaseList(parsed.autoAdvanceFromPhases, DEFAULT_POLICY.autoAdvanceFromPhases),
      approvalBoundaries: Array.isArray(parsed.approvalBoundaries) ? parsed.approvalBoundaries.filter((item) => typeof item === "string") : DEFAULT_POLICY.approvalBoundaries,
      gates: Array.isArray(parsed.gates) ? parsed.gates.filter((item) => typeof item === "string") : DEFAULT_POLICY.gates,
      transitionPolicy: normalizeTransitionPolicy(parsed.transitionPolicy),
      contextManagement: parsed.contextManagement && typeof parsed.contextManagement === "object" ? parsed.contextManagement : DEFAULT_POLICY.contextManagement,
      contextStrategy: parsed.contextStrategy && typeof parsed.contextStrategy === "object" ? normalizeContextStrategy(parsed.contextStrategy) : DEFAULT_POLICY.contextStrategy,
      subagentHandoffContract: Array.isArray(parsed.subagentHandoffContract) ? parsed.subagentHandoffContract.filter((item) => typeof item === "string" && item.trim().length > 0) : DEFAULT_POLICY.subagentHandoffContract,
      reminderPolicy: parsed.reminderPolicy && typeof parsed.reminderPolicy === "object" ? parsed.reminderPolicy : DEFAULT_POLICY.reminderPolicy,
      phaseGuidance: parsed.phaseGuidance && typeof parsed.phaseGuidance === "object" ? parsed.phaseGuidance : DEFAULT_POLICY.phaseGuidance
    };
    return _policyCache;
  } catch (err) {
    console.error(`[harness] Failed to load workflow policy from ${POLICY_FILE}: ${err}. Using defaults.`);
    return DEFAULT_POLICY;
  }
}
function sharedWorkflowPhases() {
  return loadSharedWorkflowPolicy().phases;
}
function isSharedWorkflowPhase(phase) {
  return sharedWorkflowPhases().includes(phase);
}
function sharedNextPhase(phase, phaseTemplate) {
  const phases = getPhaseTemplatePhases(phaseTemplate, sharedWorkflowPhases());
  const index = phases.indexOf(phase);
  return index >= 0 ? phases[index + 1] ?? null : null;
}
function sharedHardRules() {
  const rules = loadSharedWorkflowPolicy().reminderPolicy.hardRules;
  return Array.isArray(rules) ? rules.filter((rule) => typeof rule === "string" && rule.trim().length > 0) : [];
}
var READ_ONLY_BUILTIN = ["read", "bash", "grep", "find", "ls"];
var WRITE_BUILTIN = ["write", "edit"];
var ALL_BUILTIN = [...READ_ONLY_BUILTIN, ...WRITE_BUILTIN];

// target/.pi/extensions/workflow/state.ts
function getNextPhase(phase, phaseTemplate) {
  return sharedNextPhase(phase, phaseTemplate);
}
function loadPersistedWorkflow() {
  const file = getWorkflowStatePath();
  if (!fs2.existsSync(file)) return null;
  try {
    const workflow = JSON.parse(fs2.readFileSync(file, "utf-8"));
    workflow.cwd = workflow.cwd ?? process.cwd();
    workflow.gitRoot = workflow.gitRoot ?? getGitRoot();
    workflow.branch = workflow.branch ?? (workflow.gitRoot ? getBranch(workflow.gitRoot) : "unknown");
    workflow.phase = normalizeWorkflowPhase(workflow.phase);
    workflow.history = workflow.history.map((item) => ({
      ...item,
      from: normalizeWorkflowPhase(item.from),
      to: normalizeWorkflowPhase(item.to)
    }));
    workflow.undone = workflow.undone.map((item) => ({
      ...item,
      from: normalizeWorkflowPhase(item.from),
      to: normalizeWorkflowPhase(item.to)
    }));
    if (!isSharedWorkflowPhase(workflow.phase)) return null;
    return workflow;
  } catch {
    return null;
  }
}
function normalizeWorkflowPhase(phase) {
  return isSharedWorkflowPhase(phase) ? phase : LEGACY_WORKFLOW_PHASE_ALIASES[phase] ?? phase;
}

// target/.pi/extensions/workflow/format.ts
function formatWorkflowAction(workflow) {
  if (!workflow) {
    return [
      "[LLM WORKFLOW ACTION]",
      "- No active workflow.",
      `- If the user explicitly asks, in this conversation, to proceed via a workflow (e.g. "\uC6CC\uD06C\uD50C\uB85C\uC6B0\uB85C \uC9C4\uD589\uD574\uBCF4\uC790", "\uC6CC\uD06C\uD50C\uB85C\uC6B0 \uC2DC\uC791\uD558\uC790", "let's start a workflow for this"), call workflow_start with a concise goal.`,
      "- Otherwise, for procedural work, ask whether to start one with /workflow start <goal>.",
      "[/LLM WORKFLOW ACTION]"
    ].join("\n");
  }
  const next = getNextPhase(workflow.phase, workflow.phaseTemplate);
  const displayNext = workflow.phase === "code_review" && next === "review_approved" ? "review-approved (after review package and gates)" : next ?? "none";
  const lines = [
    "[LLM WORKFLOW ACTION]",
    `- Current phase: ${workflow.phase}`,
    `- Next phase: ${displayNext}`
  ];
  switch (workflow.phase) {
    case "interview":
      lines.push(
        "- Required now: clarify requirements, record interview artifacts, and call workflow_score_interview with per-dimension clarity scores after the wizard.",
        "- Transition: automatically prepare plan artifacts through plan_review; DPAA/SBADR runs there."
      );
      break;
    case "plan":
      lines.push(
        "- Required now: produce/update the plan and DPAA/SBADR-ready artifacts.",
        "- Transition: automatically advance to plan_review for the DPAA/SBADR gate."
      );
      break;
    case "plan_review":
      lines.push(
        "- Required now: run workflow_approve; DPAA/SBADR advances to implement only when it passes.",
        "- On a gate failure, repair the plan and retry; ask only for a genuine business decision that context cannot resolve."
      );
      break;
    case "implement":
      lines.push(
        "- Required now: implement the approved scope, use a test-first cycle for behavior changes, run the narrowest useful verification, and summarize changed files.",
        "- Transition: automatically advance to code_review after implementation is complete."
      );
      break;
    case "code_review":
      lines.push(
        "- Required now: run self-review, independent review, and quality gates, then call submit_review_package.",
        "- Transition: remain in code_review for review/fix cycles until the package and all gates pass."
      );
      break;
    case "review_approved":
      lines.push("- Required now: ensure review findings are closed/accepted; automatically continue through documentation and commit preparation.");
      break;
    case "document":
      lines.push("- Required now: update required docs or state why they are not applicable; automatically continue to commit preparation.");
      break;
    case "commit":
      lines.push(
        "- Required now: provide the diff, risk/verification summaries, and proposed commit message; create the commit after approval.",
        "- Transition: workflow_approve runs the policy scan and shows the commit \u2192 push dialog."
      );
      break;
    case "push":
      lines.push(
        "- Required now: run workflow_run_command with commandId 'git-push'; a successful push auto-advances to done.",
        "- Do not call workflow_approve in push; it cannot advance push \u2192 done."
      );
      break;
    case "done":
      lines.push("- Required now: do not continue procedural work unless the user starts a new workflow.");
      break;
  }
  lines.push(
    "- User approval is required only at commit \u2192 push.",
    "- When you have enough information to act, act. Give a recommendation instead of listing options you will not pursue.",
    "- Do not re-litigate established decisions; use current artifacts, guard evidence, and Run Ledger state as the source of truth.",
    "- workflow_state tool or /workflow state <phase> is manual recovery only (one step at a time); never use for normal advancement.",
    "[/LLM WORKFLOW ACTION]"
  );
  return lines.join("\n");
}
function formatWorkflowPrompt(workflow) {
  if (!workflow) {
    return [
      "\u2022 No active workflow.",
      `\u2022 If the user explicitly asks to proceed via a workflow (e.g. "\uC6CC\uD06C\uD50C\uB85C\uC6B0\uB85C \uC9C4\uD589\uD574\uBCF4\uC790", "let's start a workflow for this"), call workflow_start with a concise goal.`,
      "\u2022 Otherwise, for procedural work, suggest /workflow start <goal> to the user."
    ].join("\n");
  }
  const workspace = validateWorkflowWorkspace(workflow);
  const lines = [
    `\u2022 Workflow branch: ${workflow.branch}`,
    `\u2022 Workflow cwd: ${workflow.cwd}`,
    formatWorkflowAction(workflow),
    formatHardRules()
  ];
  if (!workspace.ok) lines.push(formatWorkspaceMismatch(workspace));
  return lines.join("\n");
}
function formatHardRules() {
  const rules = sharedHardRules().filter((rule) => !rule.startsWith("User approval is required"));
  return rules.length > 0 ? ["[WORKFLOW HARD RULES]", ...rules.map((rule) => `- ${rule}`), "[/WORKFLOW HARD RULES]"].join("\n") : "";
}

// target/.claude/hooks/src/lib/skip-tokens.ts
var fs3 = __toESM(require("node:fs"));
var path6 = __toESM(require("node:path"));
var SKIP_TOKEN_TTL_MS = 10 * 60 * 1e3;
function skipTokensPath() {
  return path6.join(getWorkflowStateDir(), "claude-skip-tokens.json");
}
function readTokens(now) {
  try {
    const raw = fs3.readFileSync(skipTokensPath(), "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((token) => token.expiresAt > now);
  } catch {
    return [];
  }
}
function writeTokens(tokens) {
  const file = skipTokensPath();
  fs3.mkdirSync(path6.dirname(file), { recursive: true });
  fs3.writeFileSync(file, JSON.stringify(tokens, null, 2), "utf-8");
}
function consumeClaudeSkipToken(gate, workflowId) {
  const now = Date.now();
  const tokens = readTokens(now);
  const index = tokens.findIndex((token2) => token2.gate === gate && token2.workflowId === workflowId);
  if (index < 0) {
    writeTokens(tokens);
    return null;
  }
  const [token] = tokens.splice(index, 1);
  writeTokens(tokens);
  return { reason: token.reason };
}

// target/.claude/hooks/src/workflow-gate.ts
function readStdinJson() {
  try {
    const raw = fs4.readFileSync(0, "utf8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function allow() {
  process.exit(0);
}
function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason
      }
    })
  );
  process.exit(0);
}
function injectContext(hookEventName, message) {
  if (!message) allow();
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext: message } })
  );
  process.exit(0);
}
function checkToolCall(event) {
  const toolName = event.tool_name ?? event.toolName ?? "";
  if (toolName !== "Bash") return allow();
  const command = String(event.tool_input?.command ?? event.toolInput?.command ?? "");
  if (!isGitPush(command)) return allow();
  const workflow = loadPersistedWorkflow();
  if (!workflow) {
    return deny("Blocked by workflow gate. No active workflow. Run /workflow start, work through the phases, and /workflow approve into the push phase before pushing.");
  }
  if (workflow.phase !== "push") {
    return deny(`Blocked by workflow gate. git push is allowed only in the push phase. Current phase: ${workflow.phase}. Run /workflow approve to advance toward push once ready.`);
  }
  const hasPushTransition = workflow.history.some((t) => t.from === "commit" && t.to === "push");
  if (!hasPushTransition) {
    return deny("Blocked by workflow gate. No recorded commit -> push transition in workflow history. Run /workflow approve from the commit phase.");
  }
  const workspace = validateWorkflowWorkspace(workflow);
  if (!workspace.ok) {
    return deny(formatWorkspaceMismatch(workspace));
  }
  const scan = scanPushPolicy(workflow.gitRoot);
  if (!scan.ok) {
    const skip = consumeClaudeSkipToken("policy-scan", workflow.id);
    if (!skip) return deny(formatPushPolicyScanBlocked(scan));
  }
  return allow();
}
function main() {
  const [, , command] = process.argv;
  const input = readStdinJson();
  switch (command) {
    case "check-tool-call":
      try {
        checkToolCall(input);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        deny(`Workflow gate internal error: ${message}`);
      }
      break;
    case "session-start":
      injectContext("SessionStart", formatWorkflowPrompt(loadPersistedWorkflow()));
      break;
    case "user-prompt":
      injectContext("UserPromptSubmit", formatWorkflowPrompt(loadPersistedWorkflow()));
      break;
    case "reevaluate":
      injectContext("PostToolUse", formatWorkflowPrompt(loadPersistedWorkflow()));
      break;
    default:
      allow();
  }
}
main();
