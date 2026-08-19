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

// target/.pi/extensions/workflow/state.ts
var fs10 = __toESM(require("node:fs"));
var import_node_child_process7 = require("node:child_process");

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

// target/.pi/extensions/workflow/checkpoints.ts
var import_node_child_process5 = require("node:child_process");
var fs7 = __toESM(require("node:fs"));
var path7 = __toESM(require("node:path"));

// target/.pi/extensions/workflow/storage.ts
var import_node_crypto = require("node:crypto");
var fs = __toESM(require("node:fs"));
var os = __toESM(require("node:os"));
var path = __toESM(require("node:path"));

// target/.pi/extensions/workflow/git.ts
var import_node_child_process = require("node:child_process");
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
function getDpaaReceiptDir() {
  return path.join(getWorkflowStateDir(), "dpaa-runs");
}
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
function sha256File(file) {
  return (0, import_node_crypto.createHash)("sha256").update(fs.readFileSync(file)).digest("hex");
}
function slugify(value) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return slug || "snapshot";
}

// target/.pi/extensions/workflow/gates.ts
var import_node_child_process4 = require("node:child_process");
var fs6 = __toESM(require("node:fs"));
var os2 = __toESM(require("node:os"));
var path6 = __toESM(require("node:path"));

// target/.pi/extensions/workflow/artifacts.ts
var fs3 = __toESM(require("node:fs"));
var path3 = __toESM(require("node:path"));

// target/.pi/extensions/workflow/artifact-descriptor.ts
var crypto = __toESM(require("node:crypto"));
var fs2 = __toESM(require("node:fs"));
var path2 = __toESM(require("node:path"));
var DEFAULT_INLINE_ARTIFACT_THRESHOLD_BYTES = 8 * 1024;
function describeArtifact(options) {
  const bytes = fs2.readFileSync(options.filePath);
  return {
    kind: options.kind,
    path: path2.resolve(options.filePath),
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    producer: options.producer,
    retention: options.retention,
    sizeBytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    summary: options.summary
  };
}

// target/.pi/extensions/workflow/ui.ts
function banner(title) {
  const width = Math.max(36, displayWidth(title) + 2);
  return [
    `\u2554${"\u2550".repeat(width)}\u2557`,
    `\u2551 ${padDisplay(title, width - 1)}\u2551`,
    `\u255A${"\u2550".repeat(width)}\u255D`
  ].join("\n");
}
function table(rows) {
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => displayWidth(String(row[column] ?? "")))));
  return rows.map((row, index) => {
    const line = `| ${row.map((cell, column) => padDisplay(String(cell ?? ""), widths[column])).join(" | ")} |`;
    if (index !== 0) return line;
    const separator = `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`;
    return `${line}
${separator}`;
  }).join("\n");
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

// target/.pi/extensions/workflow/artifacts.ts
function findPlanForDpaa() {
  const directCandidates = [
    path3.join(process.cwd(), ".ai", "interview", "plan.md"),
    path3.join(process.cwd(), "docs", "superpowers", "plans", "plan.md")
  ];
  for (const candidate of directCandidates) {
    if (fs3.existsSync(candidate) && fs3.statSync(candidate).isFile()) return candidate;
  }
  const planDir = path3.join(process.cwd(), "docs", "superpowers", "plans");
  if (!fs3.existsSync(planDir) || !fs3.statSync(planDir).isDirectory()) return null;
  const plans = fs3.readdirSync(planDir).filter((name) => name.endsWith(".md")).map((name) => path3.join(planDir, name)).filter((candidate) => fs3.statSync(candidate).isFile()).sort((a, b) => fs3.statSync(b).mtimeMs - fs3.statSync(a).mtimeMs);
  return plans[0] ?? null;
}
function escapeForDoubleQuotedArg(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function createArtifactSnapshot(workflow, source, reason, explicitPlanPath) {
  const specSource = path3.join(process.cwd(), ".ai", "interview", "spec.md");
  const planSource = explicitPlanPath ?? findPlanForDpaa();
  const koreanSpecSource = path3.join(process.cwd(), ".ai", "interview", "spec.ko.md");
  const koreanPlanSource = path3.join(process.cwd(), ".ai", "interview", "plan.ko.md");
  const hasSpec = fs3.existsSync(specSource) && fs3.statSync(specSource).isFile();
  const hasPlan = !!planSource && fs3.existsSync(planSource) && fs3.statSync(planSource).isFile();
  const hasKoreanSpec = fs3.existsSync(koreanSpecSource) && fs3.statSync(koreanSpecSource).isFile();
  const hasKoreanPlan = fs3.existsSync(koreanPlanSource) && fs3.statSync(koreanPlanSource).isFile();
  if (!hasSpec && !hasPlan && !hasKoreanSpec && !hasKoreanPlan) return null;
  const runDir = getArtifactRunDir(workflow.id);
  const previous = readLatestArtifactVersion(workflow.id);
  const version = nextArtifactVersion(workflow.id, reason);
  const snapshotDir = path3.join(runDir, version);
  fs3.mkdirSync(snapshotDir, { recursive: true });
  const snapshot = {
    workflowId: workflow.id,
    version,
    reason,
    source,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    previous,
    path: snapshotDir
  };
  if (hasKoreanSpec) {
    fs3.copyFileSync(koreanSpecSource, path3.join(snapshotDir, "spec.ko.md"));
  }
  if (hasKoreanPlan) {
    fs3.copyFileSync(koreanPlanSource, path3.join(snapshotDir, "plan.ko.md"));
  }
  if (hasSpec) {
    snapshot.specPath = path3.join(snapshotDir, "spec.md");
    fs3.copyFileSync(specSource, snapshot.specPath);
    snapshot.specSha256 = sha256File(snapshot.specPath);
  }
  if (hasPlan && planSource) {
    snapshot.planPath = path3.join(snapshotDir, "plan.md");
    fs3.copyFileSync(planSource, snapshot.planPath);
    snapshot.planSha256 = sha256File(snapshot.planPath);
  }
  writeArtifactSnapshotMeta(snapshot);
  writeLatestArtifactSnapshot(snapshot);
  return snapshot;
}
function updateSnapshotWithDpaa(snapshot, report, reportPath, exitCode) {
  const dpaaPath = path3.join(snapshot.path, "dpaa.json");
  fs3.copyFileSync(reportPath, dpaaPath);
  snapshot.dpaa = {
    level: report.level,
    overall: report.overall,
    findingsCount: report.findings.length,
    exitCode,
    reportSha256: sha256File(dpaaPath)
  };
  writeArtifactSnapshotMeta(snapshot);
  writeLatestArtifactSnapshot(snapshot);
}
function writeArtifactSnapshotMeta(snapshot) {
  fs3.writeFileSync(path3.join(snapshot.path, "meta.json"), JSON.stringify(snapshot, null, 2), "utf-8");
}
function writeLatestArtifactSnapshot(snapshot) {
  fs3.mkdirSync(getArtifactRunDir(snapshot.workflowId), { recursive: true });
  fs3.writeFileSync(path3.join(getArtifactRunDir(snapshot.workflowId), "latest.json"), JSON.stringify(snapshot, null, 2), "utf-8");
}
function readLatestArtifactVersion(workflowId) {
  const latestPath = path3.join(getArtifactRunDir(workflowId), "latest.json");
  if (!fs3.existsSync(latestPath)) return null;
  try {
    return JSON.parse(fs3.readFileSync(latestPath, "utf-8")).version ?? null;
  } catch {
    return null;
  }
}
function nextArtifactVersion(workflowId, reason) {
  const runDir = getArtifactRunDir(workflowId);
  const existing = fs3.existsSync(runDir) ? fs3.readdirSync(runDir).filter((name) => /^\d{3}-/.test(name)) : [];
  const next = existing.reduce((max, name) => Math.max(max, Number(name.slice(0, 3)) || 0), 0) + 1;
  return `${String(next).padStart(3, "0")}-${slugify(reason)}`;
}
function getArtifactRunDir(workflowId) {
  return path3.join(process.cwd(), ".ai", "interview", "runs", workflowId);
}
function writeDpaaReceipt(args) {
  const receipt = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    workflowId: args.workflow.id,
    from: args.from,
    to: args.to,
    projectRoot: process.cwd(),
    planPath: args.planPath,
    planSha256: sha256File(args.planPath),
    exitCode: args.exitCode,
    level: args.report.level,
    overall: args.report.overall,
    findingsCount: args.report.findings.length,
    reportSha256: sha256File(args.reportPath),
    reportDescriptor: describeArtifact({
      kind: "dpaa-report",
      filePath: args.reportPath,
      producer: { system: "harness", component: "dpaa" },
      retention: "until-completion",
      summary: `DPAA ${args.report.level}: ${args.report.findings.length} finding(s), penalty=${args.report.overall}.`
    }),
    snapshotVersion: args.snapshot?.version,
    snapshotPath: args.snapshot?.path
  };
  const dir = getDpaaReceiptDir();
  fs3.mkdirSync(dir, { recursive: true });
  const file = path3.join(dir, `${Date.now()}-${receipt.level.toLowerCase()}.json`);
  fs3.writeFileSync(file, JSON.stringify(receipt, null, 2), "utf-8");
  return receipt;
}
function formatLatestDpaaAudit() {
  const receipt = readLatestDpaaReceipt();
  if (!receipt) {
    return "\u26AA DPAA \uC2E4\uD589 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.";
  }
  const icon = receipt.level === "PASS" ? "\u2705" : receipt.level === "WARN" ? "\u26A0\uFE0F" : "\u274C";
  return [
    banner(`${icon} \uCD5C\uADFC DPAA \uC2E4\uD589 \uAE30\uB85D`),
    table([
      ["\uD56D\uBAA9", "\uAC12"],
      ["\uC2DC\uAC04", receipt.timestamp],
      ["Workflow", receipt.workflowId],
      ["\uC804\uC774", `${receipt.from} \u2192 ${receipt.to}`],
      ["\uACB0\uACFC", receipt.level],
      ["Penalty", `${receipt.overall} (\uB0AE\uC744\uC218\uB85D \uC88B\uC74C)`],
      ["Exit code", String(receipt.exitCode)],
      ["Findings", String(receipt.findingsCount)],
      ["Plan", path3.relative(process.cwd(), receipt.planPath)],
      ["Plan hash", receipt.planSha256],
      ["Report hash", receipt.reportSha256],
      ["Report artifact", receipt.reportDescriptor ? path3.relative(process.cwd(), receipt.reportDescriptor.path) : "\uC5C6\uC74C"],
      ["Snapshot", receipt.snapshotVersion ?? "\uC5C6\uC74C"]
    ])
  ].join("\n");
}
function readLatestDpaaReceipt() {
  const dir = getDpaaReceiptDir();
  if (!fs3.existsSync(dir)) return null;
  const files = fs3.readdirSync(dir).filter((name) => name.endsWith(".json")).map((name) => path3.join(dir, name)).filter((file) => fs3.statSync(file).isFile()).sort((a, b) => fs3.statSync(b).mtimeMs - fs3.statSync(a).mtimeMs);
  if (!files[0]) return null;
  return JSON.parse(fs3.readFileSync(files[0], "utf-8"));
}

// target/.pi/extensions/workflow/catalog.ts
var import_node_child_process2 = require("node:child_process");
var fs4 = __toESM(require("node:fs"));
var path4 = __toESM(require("node:path"));
var HARNESS_ROOT = path4.resolve(__dirname, "../../..");
var PI_ROOT = path4.join(HARNESS_ROOT, ".pi");
var WORKFLOW_DIR = path4.join(PI_ROOT, "workflows");
function resolveGodotAdapterCommand(root, action) {
  const venvPython = process.platform === "win32" ? path4.join(root, ".pi", ".venv", "Scripts", "python.exe") : path4.join(root, ".pi", ".venv", "bin", "python");
  const executable = fs4.existsSync(venvPython) ? venvPython : process.platform === "win32" ? "python" : "python3";
  const adapter = path4.join(root, ".pi", "skills", "godot-development", "tools", "godot_quality.py");
  return { executable, args: [adapter, action] };
}
function hasMakeTarget(makeRoot, target) {
  for (const name of ["Makefile", "makefile", "GNUmakefile"]) {
    const full = path4.join(makeRoot, name);
    if (!fs4.existsSync(full)) continue;
    try {
      if (new RegExp(`^${target}\\s*:`, "m").test(fs4.readFileSync(full, "utf-8"))) return true;
    } catch {
    }
  }
  return false;
}
function detectBuildSystem(root) {
  const exists = (f) => fs4.existsSync(path4.join(root, f));
  if (exists("AGENTS.md") && exists("target/.pi/extensions/workflow.ts") && exists("tests/test_workflow_extension_runtime.py")) {
    return {
      type: "harness",
      testCommand: { executable: "python", args: ["-m", "pytest", "tests"] },
      buildCommand: null,
      qualityCommand: { executable: "python", args: ["-m", "pytest", "tests"] }
    };
  }
  if (exists("project.godot")) {
    return {
      type: "godot",
      testCommand: resolveGodotAdapterCommand(root, "test"),
      buildCommand: resolveGodotAdapterCommand(root, "export"),
      qualityCommand: resolveGodotAdapterCommand(root, "gate")
    };
  }
  if (exists("gradlew") || exists("gradlew.bat") || exists("build.gradle") || exists("build.gradle.kts")) {
    const gradleBin = process.platform === "win32" && exists("gradlew.bat") ? path4.join(root, "gradlew.bat") : exists("gradlew") ? path4.join(root, "gradlew") : "gradle";
    let hasQualityGuard = false;
    let hasCoverageGuard = false;
    for (const f of ["build.gradle", "build.gradle.kts"]) {
      try {
        const content = exists(f) ? fs4.readFileSync(path4.join(root, f), "utf-8") : null;
        if (content && /\btask\s+codeQualityGuard\b/.test(content)) hasQualityGuard = true;
        if (content && /\btask\s+coverageGuard\b/.test(content)) hasCoverageGuard = true;
      } catch {
      }
    }
    const qualityArgs = hasQualityGuard ? hasCoverageGuard ? ["codeQualityGuard", "coverageGuard"] : ["codeQualityGuard"] : null;
    return {
      type: "gradle",
      testCommand: { executable: gradleBin, args: ["test"] },
      buildCommand: { executable: gradleBin, args: ["build", "-x", "test"] },
      qualityCommand: qualityArgs ? { executable: gradleBin, args: qualityArgs } : null
    };
  }
  if (exists("pom.xml")) {
    const mvnBin = process.platform === "win32" && exists("mvnw.cmd") ? path4.join(root, "mvnw.cmd") : exists("mvnw") ? path4.join(root, "mvnw") : "mvn";
    return {
      type: "maven",
      testCommand: { executable: mvnBin, args: ["test"] },
      buildCommand: { executable: mvnBin, args: ["package", "-DskipTests"] },
      qualityCommand: { executable: mvnBin, args: ["verify", "-DskipTests"] }
    };
  }
  if (exists("package.json")) {
    let pm = "npm";
    let pmBin = "npm";
    if (exists("bun.lockb") || exists("bun.lock")) {
      pm = "bun";
      pmBin = "bun";
    } else if (exists("pnpm-lock.yaml")) {
      pm = "pnpm";
      pmBin = "pnpm";
    } else if (exists("yarn.lock")) {
      pm = "yarn";
      pmBin = "yarn";
    }
    let hasLint = false;
    let hasTest = false;
    let hasBuild = false;
    try {
      const pkg = JSON.parse(fs4.readFileSync(path4.join(root, "package.json"), "utf-8"));
      hasLint = !!pkg.scripts?.lint;
      hasTest = !!pkg.scripts?.test;
      hasBuild = !!pkg.scripts?.build;
    } catch {
    }
    return {
      type: pm,
      testCommand: hasTest ? { executable: pmBin, args: ["run", "test"] } : null,
      buildCommand: hasBuild ? { executable: pmBin, args: ["run", "build"] } : null,
      qualityCommand: hasLint ? { executable: pmBin, args: ["run", "lint"] } : null
    };
  }
  if (exists("poetry.lock") || exists("pyproject.toml") && (() => {
    try {
      return fs4.readFileSync(path4.join(root, "pyproject.toml"), "utf-8").includes("[tool.poetry]");
    } catch {
      return false;
    }
  })()) {
    return {
      type: "poetry",
      testCommand: { executable: "poetry", args: ["run", "pytest"] },
      buildCommand: { executable: "poetry", args: ["build"] },
      qualityCommand: null
    };
  }
  if (exists("pyproject.toml") || exists("setup.py") || exists("setup.cfg") || exists("requirements.txt")) {
    return {
      type: "pip",
      testCommand: { executable: "pytest", args: [] },
      buildCommand: null,
      qualityCommand: null
    };
  }
  if (exists("go.mod")) {
    const hasGolangciLint = commandOk("golangci-lint --version");
    return {
      type: "go",
      testCommand: { executable: "go", args: ["test", "./..."] },
      buildCommand: { executable: "go", args: ["build", "./..."] },
      qualityCommand: hasGolangciLint ? { executable: "golangci-lint", args: ["run", "./..."] } : { executable: "go", args: ["vet", "./..."] }
    };
  }
  if (exists("Cargo.toml")) {
    return {
      type: "cargo",
      testCommand: { executable: "cargo", args: ["test"] },
      buildCommand: { executable: "cargo", args: ["build"] },
      qualityCommand: { executable: "cargo", args: ["clippy", "--", "-D", "warnings"] }
    };
  }
  if (exists("Makefile") || exists("makefile") || exists("GNUmakefile")) {
    return {
      type: "make",
      testCommand: hasMakeTarget(root, "test") ? { executable: "make", args: ["test"] } : null,
      buildCommand: hasMakeTarget(root, "build") ? { executable: "make", args: ["build"] } : null,
      qualityCommand: hasMakeTarget(root, "lint") ? { executable: "make", args: ["lint"] } : null
    };
  }
  return { type: "unknown", testCommand: null, buildCommand: null, qualityCommand: null };
}
function scanWorkflowPrerequisites(root = HARNESS_ROOT) {
  const exists = (relativePath) => fs4.existsSync(path4.join(root, relativePath));
  const required = [
    ".pi/WORKFLOW.md",
    ".pi/extensions/workflow.ts",
    ".pi/extensions/workflow",
    ".pi/skills",
    ".pi/workflows",
    ".pi/dpaa",
    ".pi/sbadr",
    ".pi/pyproject.toml",
    ".pi/schemas/harness-field-log-event.schema.json"
  ];
  const missingRequired = required.filter((item) => !exists(item));
  const projectRoot2 = getGitRoot() ?? root;
  const warnings = [];
  const bs = detectBuildSystem(projectRoot2);
  if (bs.type === "unknown" && !process.env.HARNESS_CODE_QUALITY_GUARD_CMD) {
    warnings.push("No recognized build system found. Set HARNESS_CODE_QUALITY_GUARD_CMD to enable the code quality gate.");
  }
  if (bs.type === "gradle") {
    const projectAnyExists = (relativePaths) => relativePaths.some((p) => fs4.existsSync(path4.join(projectRoot2, p)));
    if (!projectAnyExists(["config/checkstyle/checkstyle.xml", "checkstyle.xml", "config/checkstyle/sun_checks.xml", "config/checkstyle/google_checks.xml"])) {
      warnings.push("Checkstyle config not found; Checkstyle guard may be incomplete.");
    }
    if (!bs.qualityCommand && !process.env.HARNESS_CODE_QUALITY_GUARD_CMD) {
      warnings.push("Gradle codeQualityGuard task not found; add it to build.gradle or set HARNESS_CODE_QUALITY_GUARD_CMD.");
    }
  } else if (bs.type !== "unknown" && bs.qualityCommand === null && !process.env.HARNESS_CODE_QUALITY_GUARD_CMD) {
    warnings.push(`No code quality gate detected for ${bs.type} project. Set HARNESS_CODE_QUALITY_GUARD_CMD to enable.`);
  }
  return { ok: missingRequired.length === 0, root, missingRequired, warnings };
}
function formatWorkflowPrerequisiteScan(scan) {
  const sections = [banner("\u{1F9F0} Workflow prerequisite scan")];
  sections.push(`Root: ${scan.root}`);
  if (scan.missingRequired.length > 0) {
    sections.push("", "Missing required files/directories:", ...scan.missingRequired.map((item) => `  - ${item}`));
  }
  if (scan.warnings.length > 0) {
    sections.push("", "Warnings:", ...scan.warnings.map((item) => `  - ${item}`));
  }
  if (scan.missingRequired.length === 0 && scan.warnings.length === 0) {
    sections.push("All required workflow files and quality guard hints are present.");
  }
  return sections.join("\n");
}
function commandOk(command2) {
  try {
    (0, import_node_child_process2.execSync)(command2, { cwd: HARNESS_ROOT, encoding: "utf-8", stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
function pythonOk(command2) {
  return commandOk(`${command2} -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)"`);
}
function formatHarnessDoctor() {
  const scan = scanWorkflowPrerequisites();
  const venvPython = process.platform === "win32" ? path4.join(PI_ROOT, ".venv", "Scripts", "python.exe") : path4.join(PI_ROOT, ".venv", "bin", "python");
  const python = pythonOk("python");
  const python3 = pythonOk("python3");
  const dpaaImport = fs4.existsSync(venvPython) && commandOk(`"${venvPython}" -c "import dpaa.cli"`);
  const sbadrImport = fs4.existsSync(venvPython) && commandOk(`"${venvPython}" -c "import sbadr.cli"`);
  const coreNlpDir = path4.join(PI_ROOT, "corenlp");
  const coreNlpInstalled = fs4.existsSync(coreNlpDir) && fs4.readdirSync(coreNlpDir).some(
    (f) => f.startsWith("stanford-corenlp-") && f.endsWith(".jar") && !f.includes("javadoc") && !f.includes("sources") && !f.includes("models")
  );
  const javaOk = commandOk("java -version");
  const legacyClaudeAssets = fs4.existsSync(path4.join(HARNESS_ROOT, ".claude"));
  const projectRootForDoctor = getGitRoot() ?? HARNESS_ROOT;
  const bs = detectBuildSystem(projectRootForDoctor);
  const qualityGateLabel = bs.qualityCommand ? `${bs.qualityCommand.executable} ${bs.qualityCommand.args.join(" ")}` : process.env.HARNESS_CODE_QUALITY_GUARD_CMD ? "env:HARNESS_CODE_QUALITY_GUARD_CMD" : "NOT CONFIGURED (set HARNESS_CODE_QUALITY_GUARD_CMD)";
  const checks = [
    ["runtime files", scan.ok ? "OK" : "FAIL"],
    ["git", commandOk("git --version") ? "OK" : "FAIL"],
    ["python >= 3.10", python || python3 ? "OK" : "FAIL"],
    ["python command", python ? "OK" : "WARN"],
    ["python3 command", python3 ? "OK" : "WARN"],
    ["DPAA venv", fs4.existsSync(venvPython) ? "OK" : "MISSING (auto-created on first DPAA gate)"],
    ["DPAA import", dpaaImport ? "OK" : "MISSING (auto-installed on first DPAA gate)"],
    ["SBADR import", sbadrImport ? "OK" : "MISSING (auto-installed on first DPAA gate)"],
    ["java >= 17", javaOk ? "OK" : "MISSING (required for SBADR/CoreNLP)"],
    ["CoreNLP", coreNlpInstalled ? "OK" : `MISSING (auto-installed on first DPAA gate; run ${process.platform === "win32" ? ".pi/setup_corenlp.ps1" : ".pi/setup_corenlp.sh"} to install manually)`],
    ["setup_corenlp", fs4.existsSync(path4.join(PI_ROOT, process.platform === "win32" ? "setup_corenlp.ps1" : "setup_corenlp.sh")) ? "OK" : "MISSING"],
    ["legacy .claude assets", legacyClaudeAssets ? "WARN (remove target/project .claude workflow assets; Pi runtime is canonical)" : "OK"],
    ["project build system", bs.type],
    ["code quality gate", qualityGateLabel],
    ["project AGENTS.md", fs4.existsSync(path4.join(HARNESS_ROOT, "AGENTS.md")) ? "OK" : "FAIL"]
  ];
  return [
    banner("\u{1FA7A} Harness doctor"),
    table([["Check", "Status"], ...checks]),
    "",
    formatWorkflowPrerequisiteScan(scan)
  ].join("\n");
}
var PI_EXT_ROOT = path4.resolve(__dirname, "../..");
var HARNESS_EXT_ROOT = path4.resolve(__dirname, "../../..");

// target/.pi/extensions/workflow/field-log.ts
var import_node_child_process3 = require("node:child_process");
var crypto2 = __toESM(require("node:crypto"));
var fs5 = __toESM(require("node:fs"));
var path5 = __toESM(require("node:path"));
var HARNESS_ROOT2 = path5.resolve(__dirname, "../../..");
var MEMORY_DIR = path5.join(".project-memory", "harness");
var EVENTS_FILE = "events.jsonl";
var AUDIT_FILE = "audit.jsonl";
var _runtimeCache = {};
function projectRoot() {
  return process.env.HARNESS_FIELD_LOG_ROOT || getGitRoot() || process.cwd();
}
function ensureProjectMemoryIgnored(root) {
  const exclude = path5.join(root, ".git", "info", "exclude");
  try {
    if (!fs5.existsSync(path5.join(root, ".git"))) return;
    fs5.mkdirSync(path5.dirname(exclude), { recursive: true });
    const current = fs5.existsSync(exclude) ? fs5.readFileSync(exclude, "utf-8") : "";
    if (!/^\.project-memory\/$/m.test(current)) {
      fs5.appendFileSync(exclude, `${current.endsWith("\n") || current.length === 0 ? "" : "\n"}.project-memory/
`, "utf-8");
    }
  } catch {
  }
}
function fieldLogDir(root = projectRoot()) {
  return path5.join(root, MEMORY_DIR);
}
function fieldLogPath(root = projectRoot()) {
  return path5.join(fieldLogDir(root), EVENTS_FILE);
}
function auditLogPath(root = projectRoot()) {
  return path5.join(fieldLogDir(root), AUDIT_FILE);
}
function exportDir(root = projectRoot()) {
  return path5.join(fieldLogDir(root), "exports");
}
function shortHash(value) {
  return crypto2.createHash("sha256").update(value).digest("hex").slice(0, 12);
}
function ensureProjectAnonymousId(root) {
  const dir = fieldLogDir(root);
  const idPath = path5.join(dir, "project-id");
  fs5.mkdirSync(dir, { recursive: true });
  if (fs5.existsSync(idPath)) return fs5.readFileSync(idPath, "utf-8").trim();
  const basis = `${root}:${Date.now()}:${crypto2.randomBytes(8).toString("hex")}`;
  const id = `proj_${shortHash(basis)}`;
  fs5.writeFileSync(idPath, `${id}
`, "utf-8");
  return id;
}
function commandOutput(command2, cwd = HARNESS_ROOT2) {
  try {
    return (0, import_node_child_process3.execSync)(command2, { cwd, encoding: "utf-8", stdio: "pipe" }).trim() || void 0;
  } catch {
    return void 0;
  }
}
function detectRepoKind(root) {
  const has = (file) => fs5.existsSync(path5.join(root, file));
  const kinds = [
    has("pom.xml") || has("build.gradle") || has("build.gradle.kts") ? "java-spring" : null,
    has("package.json") ? "node" : null,
    has("pyproject.toml") || has("requirements.txt") ? "python" : null,
    has("go.mod") ? "go" : null
  ].filter(Boolean);
  if (kinds.length > 1) return "mixed";
  return kinds[0] ?? "unknown";
}
function redact(value, root) {
  const normalizedRoot = root.replace(/\\/g, "/");
  return value.replaceAll(root, "<PROJECT_ROOT>").replaceAll(normalizedRoot, "<PROJECT_ROOT>").replace(/https?:\/\/[^\s]+/g, "<URL>");
}
function limit(value, max = 2e3) {
  if (value == null) return null;
  return value.length > max ? `${value.slice(0, max)}\u2026[truncated]` : value;
}
function hintsFor(category) {
  if (category === "dpaa") return {
    improvementKind: "dpaa-rule",
    targetFilesHint: ["target/.pi/dpaa/rules/", "target/.pi/dpaa/layers/", "target/.pi/dpaa/suggestions/templates.yaml", "tests/test_verification.py"]
  };
  if (category === "code-quality") return {
    improvementKind: "doctor-check",
    targetFilesHint: ["target/.pi/extensions/workflow/gates.ts", "target/.pi/extensions/workflow/catalog.ts", "tests/test_code_quality_gate.py"]
  };
  if (category === "push-policy") return {
    improvementKind: "workflow-rule",
    targetFilesHint: ["target/.pi/extensions/workflow/gates.ts", "tests/test_push_policy_scan.py"]
  };
  if (category === "workspace" || category === "phase") return {
    improvementKind: "workflow-rule",
    targetFilesHint: ["target/.pi/extensions/workflow.ts", "target/.pi/extensions/workflow/gates.ts", "tests/test_workflow_extension_runtime.py"]
  };
  if (category === "doctor") return {
    improvementKind: "doctor-check",
    targetFilesHint: ["target/.pi/extensions/workflow/catalog.ts", "scripts/harness-doctor.sh", "scripts/harness-doctor.ps1"]
  };
  if (category === "init" || category === "update") return {
    improvementKind: "init-update",
    targetFilesHint: ["scripts/init-target-harness.sh", "scripts/init-target-harness.ps1", "scripts/update-harness.sh", "scripts/update-harness.ps1"]
  };
  return { improvementKind: "unknown", targetFilesHint: [] };
}
function buildFieldLogEvent(input) {
  const root = projectRoot();
  const workflow = input.workflow;
  const branch = getBranch(root);
  const defaults = hintsFor(input.category);
  const eventId = `hlog_${(/* @__PURE__ */ new Date()).toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${crypto2.randomBytes(4).toString("hex")}`;
  const redactedFiles = (input.files ?? []).map((file) => ({ ...file, path: redact(file.path, root) }));
  return {
    schemaVersion: 1,
    eventId,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    harness: {
      version: _runtimeCache.harnessVersion ??= commandOutput(`git -C "${HARNESS_ROOT2}" rev-parse --short HEAD`) ?? "unknown",
      gitCommit: commandOutput("git rev-parse --short HEAD") ?? "unknown",
      runtime: {
        host: "pi",
        platform: process.platform,
        nodeVersion: process.version,
        pythonVersion: _runtimeCache.pythonVersion ??= commandOutput("python --version") ?? commandOutput("python3 --version")
      }
    },
    project: {
      anonymousId: ensureProjectAnonymousId(root),
      repoKind: detectRepoKind(root),
      branch,
      worktree: redact(root, root),
      gitHead: commandOutput(`git -C "${root}" rev-parse --short HEAD`, root)
    },
    workflow: {
      workflowId: workflow?.id ?? "none",
      phase: workflow?.phase ?? "none",
      fromPhase: input.fromPhase,
      toPhase: input.toPhase
    },
    event: {
      type: input.type,
      category: input.category,
      severity: input.severity,
      status: input.status ?? "open"
    },
    failure: {
      summary: redact(input.summary, root),
      expected: redact(input.expected, root),
      actual: redact(input.actual, root),
      impact: redact(input.impact, root),
      rootCause: input.rootCause ? redact(input.rootCause, root) : null,
      resolution: input.resolution ? redact(input.resolution, root) : null,
      evidence: {
        primaryMessage: redact(input.primaryMessage, root),
        exitCode: input.exitCode ?? null,
        command: input.command ? redact(input.command, root) : null,
        findingCodes: input.findingCodes ?? [],
        files: redactedFiles,
        logExcerpt: limit(input.logExcerpt ? redact(input.logExcerpt, root) : null, 2e3)
      }
    },
    llmAnalysisPacket: {
      problemForHarnessRepo: input.problemForHarnessRepo ?? `PENDING: analyze ${input.category} ${input.type} for harness improvement potential.`,
      reproductionHint: input.reproductionHint ?? "PENDING: derive a minimal reproduction from the evidence fields.",
      improvementKind: input.improvementKind ?? defaults.improvementKind ?? "unknown",
      candidateChange: input.candidateChange ?? "PENDING: propose a concrete harness repo change.",
      targetFilesHint: input.targetFilesHint ?? defaults.targetFilesHint ?? [],
      acceptanceCriteria: input.acceptanceCriteria ?? ["Harness improvement has a regression test covering this failure pattern."],
      negativeExamples: input.negativeExamples ?? []
    },
    privacy: {
      redactionLevel: "paths-only",
      containsSensitiveData: Boolean(input.sensitive),
      exportableToHarnessRepo: !input.sensitive,
      redactionNotes: "Absolute project paths and URLs are redacted. Raw full logs are not embedded."
    }
  };
}
function auditEventFromFieldLog(input) {
  if (input.type === "gate.failed") {
    return {
      eventType: "guard_block",
      workflow: input.workflow,
      phase: input.workflow?.phase,
      fromPhase: input.fromPhase,
      toPhase: input.toPhase,
      gate: input.category,
      result: "blocked",
      severity: input.severity,
      reasonSummary: input.summary
    };
  }
  if (input.type === "gate.skipped") {
    return {
      eventType: "guard_skip",
      workflow: input.workflow,
      phase: input.workflow?.phase,
      fromPhase: input.fromPhase,
      toPhase: input.toPhase,
      gate: input.category,
      result: "skipped",
      severity: input.severity,
      reasonSummary: input.summary
    };
  }
  return null;
}
function writeAuditLogEvent(input) {
  try {
    const root = projectRoot();
    ensureProjectMemoryIgnored(root);
    const workflow = input.workflow;
    const event = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      eventType: input.eventType,
      workflowId: input.workflowId ?? workflow?.id ?? "none",
      phase: input.phase ?? workflow?.phase ?? null,
      fromPhase: input.fromPhase ?? null,
      toPhase: input.toPhase ?? null,
      gate: input.gate ?? null,
      result: input.result ?? null,
      severity: input.severity ?? "info",
      reasonSummary: limit(input.reasonSummary ? redact(input.reasonSummary, root) : null, 500)
    };
    const file = auditLogPath(root);
    fs5.mkdirSync(path5.dirname(file), { recursive: true });
    fs5.appendFileSync(file, `${JSON.stringify(event)}
`, "utf-8");
    return event.timestamp;
  } catch {
    return null;
  }
}
function writeFieldLogEvent(input) {
  try {
    const root = projectRoot();
    ensureProjectMemoryIgnored(root);
    const event = buildFieldLogEvent(input);
    const file = fieldLogPath(root);
    fs5.mkdirSync(path5.dirname(file), { recursive: true });
    fs5.appendFileSync(file, `${JSON.stringify(event)}
`, "utf-8");
    const auditEvent = auditEventFromFieldLog(input);
    if (auditEvent) writeAuditLogEvent(auditEvent);
    return event.eventId;
  } catch {
    return null;
  }
}
function readRecentFieldLogEvents(limitCount = 10) {
  const file = fieldLogPath();
  if (!fs5.existsSync(file)) return [];
  const lines = fs5.readFileSync(file, "utf-8").split(/\r?\n/).filter(Boolean);
  return lines.slice(-limitCount).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
}
function formatRecentFieldLogs(limitCount = 10) {
  const events = readRecentFieldLogEvents(limitCount);
  if (events.length === 0) return [banner("\u{1F9FE} Harness field logs"), "No field log events found."].join("\n");
  return [
    banner("\u{1F9FE} Harness field logs"),
    formatFieldLogSummary(events),
    "",
    table([
      ["Time", "Category", "Type", "Severity", "Summary"],
      ...events.map((event) => [
        String(event.timestamp ?? "").replace(/T/, " ").replace(/\.\d+Z$/, "Z"),
        event.event?.category ?? "unknown",
        event.event?.type ?? "unknown",
        event.event?.severity ?? "unknown",
        String(event.failure?.summary ?? "").slice(0, 90)
      ])
    ]),
    "",
    "Export redacted logs: /workflow failures export"
  ].join("\n");
}
function formatFieldLogSummary(events) {
  return [
    "By category: " + formatCounts(events.map((event) => event.event?.category ?? "unknown")),
    "By severity: " + formatCounts(events.map((event) => event.event?.severity ?? "unknown"))
  ].join("\n");
}
function formatCounts(values) {
  const counts = /* @__PURE__ */ new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([value, count]) => `${value}=${count}`).join(", ");
}
function exportFieldLogs() {
  const root = projectRoot();
  ensureProjectMemoryIgnored(root);
  const source = fieldLogPath(root);
  fs5.mkdirSync(exportDir(root), { recursive: true });
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const target = path5.join(exportDir(root), `harness-log-${stamp}.redacted.jsonl`);
  if (!fs5.existsSync(source)) {
    fs5.writeFileSync(target, "", "utf-8");
    return target;
  }
  const lines = fs5.readFileSync(source, "utf-8").split(/\r?\n/).filter(Boolean);
  const exportable = lines.filter((line) => {
    try {
      const event = JSON.parse(line);
      return event.privacy?.exportableToHarnessRepo !== false;
    } catch {
      return false;
    }
  });
  fs5.writeFileSync(target, `${exportable.join("\n")}${exportable.length ? "\n" : ""}`, "utf-8");
  return target;
}

// target/.pi/extensions/workflow/domain/ambiguity-gate-policy.ts
var STRICT_PATTERNS = [
  /\b(api|endpoint|contract|schema|migration|database|db|auth|security|permission|role|payment|billing|money|delete|destructive|privacy|pii|token|secret|credential|docker|ci|deploy|release)\b/i,
  /\bbreaking\s+change\b/i,
  /\bdata\s+(loss|deletion|migration)\b/i
];
var ADVISORY_PATTERNS = [
  /\b(spike|explore|investigate|research|analy[sz]e|check|inspect|review\s+only)\b/i,
  /\b(docs?|readme|comment|typo|copy|text|wording|style|cosmetic|theme|color|spacing|formatting)\b/i,
  /\b(small|minor|tiny|quick|simple)\b/i
];
var STRICT_WORK_TYPES = /* @__PURE__ */ new Set(["api", "contract", "schema", "security", "migration", "database", "data", "deploy", "release"]);
var ADVISORY_WORK_TYPES = /* @__PURE__ */ new Set(["docs", "documentation", "cosmetic", "discovery", "research", "spike", "style", "theme"]);
function classifyAmbiguityGatePolicy(workflow, planText = "") {
  const metadata = parseAmbiguityPolicyMetadata(planText);
  const metadataPolicy = policyFromMetadata(metadata);
  if (metadataPolicy) return metadataPolicy;
  const titleSource = workflow.title;
  const strictSource = `${workflow.title}
${planText}`;
  if (STRICT_PATTERNS.some((pattern) => pattern.test(strictSource))) {
    return buildPolicy(
      "strict",
      "High-risk/API/schema/security/data/deployment keyword detected."
    );
  }
  if (ADVISORY_PATTERNS.some((pattern) => pattern.test(titleSource))) {
    return buildPolicy(
      "advisory",
      "Low-risk, documentation/cosmetic, or discovery-oriented keyword detected."
    );
  }
  return buildPolicy("standard", "Default feature/workflow ambiguity policy.");
}
function policyFromMetadata(metadata) {
  if (metadata.risk === "high") {
    return buildPolicy("strict", "Explicit plan metadata marked risk as high.");
  }
  if (metadata.workType && workTypeHasSignal(metadata.workType, STRICT_WORK_TYPES)) {
    return buildPolicy("strict", `Explicit plan metadata marked work type '${metadata.workType}' as high risk.`);
  }
  if (metadata.ambiguityGate === "strict") {
    return buildPolicy("strict", "Explicit plan metadata selected ambiguity gate 'strict'.");
  }
  if (metadata.ambiguityGate) {
    return buildPolicy(metadata.ambiguityGate, `Explicit plan metadata selected ambiguity gate '${metadata.ambiguityGate}'.`);
  }
  if (metadata.risk === "low") {
    return buildPolicy("advisory", "Explicit plan metadata marked risk as low.");
  }
  if (metadata.workType && workTypeHasSignal(metadata.workType, ADVISORY_WORK_TYPES)) {
    return buildPolicy("advisory", `Explicit plan metadata marked work type '${metadata.workType}' as low risk.`);
  }
  if (metadata.risk === "normal") {
    return buildPolicy("standard", "Explicit plan metadata marked risk as normal.");
  }
  return void 0;
}
function workTypeHasSignal(workType, signals) {
  if (signals.has(workType)) return true;
  return workType.split("-").some((part) => signals.has(part));
}
function parseAmbiguityPolicyMetadata(planText) {
  const metadata = {};
  for (const line of planText.split(/\r?\n/).slice(0, 40)) {
    const match = line.match(/^\s*(?:[-*]\s*)?(risk|work\s*type|ambiguity\s*gate)\s*:\s*([^#]+?)\s*$/i);
    if (!match) continue;
    const key = match[1].toLowerCase().replace(/\s+/g, " ");
    const value = normalizeMetadataValue(match[2]);
    if (key === "ambiguity gate" && isAmbiguityGateStrictness(value)) metadata.ambiguityGate = value;
    if (key === "risk" && isRiskValue(value)) metadata.risk = value;
    if (key === "work type") metadata.workType = value;
  }
  return metadata;
}
function normalizeMetadataValue(value) {
  return value.trim().toLowerCase().replace(/^['"]|['"]$/g, "").replace(/[_.\s]+/g, "-");
}
function isAmbiguityGateStrictness(value) {
  return value === "advisory" || value === "standard" || value === "strict";
}
function isRiskValue(value) {
  return value === "low" || value === "normal" || value === "high";
}
function buildPolicy(strictness, reason) {
  const blocks = strictness !== "advisory";
  return {
    strictness,
    reason,
    requiresPlan: strictness !== "advisory",
    blocksDpaaFail: blocks,
    blocksSbadrFail: blocks
  };
}
function formatAmbiguityGatePolicy(policy) {
  return `Ambiguity policy: ${policy.strictness} (${policy.reason})`;
}

// target/.pi/extensions/workflow/domain/phase-template-policy.ts
function parsePhaseTemplateMetadata(planText) {
  for (const line of planText.split(/\r?\n/).slice(0, 40)) {
    const match = line.match(/^\s*(?:[-*]\s*)?phase\s*template\s*:\s*([^#]+?)\s*$/i);
    if (!match) continue;
    const value = match[1].trim().toLowerCase();
    if (value === "light" || value === "full") return value;
  }
  return void 0;
}
function getPhaseTemplatePhases(templateName, basePhases) {
  if (templateName === "light") return basePhases.filter((phase) => phase !== "document");
  return basePhases;
}

// target/.pi/extensions/workflow/gates.ts
var HARNESS_ROOT3 = path6.resolve(__dirname, "../../..");
var PI_ROOT2 = path6.join(HARNESS_ROOT3, ".pi");
var DPAA_VENV_DIR = path6.join(PI_ROOT2, ".venv");
var CORENLP_DIR = path6.join(PI_ROOT2, "corenlp");
function getChangedFileAbsPaths(root) {
  try {
    const out = (0, import_node_child_process4.execSync)("git status --porcelain=v1", {
      cwd: root,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 10 * 1024 * 1024
    }).trim();
    if (!out) return [];
    return out.split(/\r?\n/).map((line) => {
      const filePart = line.slice(3).trim().split(" -> ").pop() ?? "";
      return filePart ? path6.resolve(root, filePart) : "";
    }).filter(Boolean);
  } catch {
    return [];
  }
}
function extractViolationFilePaths(output, root) {
  const results = /* @__PURE__ */ new Set();
  const ABS_RE = /(?:^|[\s\[\("'])((?:[A-Za-z]:[/\\]|\/)[^\s"'*?<>|\[\]]*?\.(?:java|kt|groovy|scala))(?=:\d)/gm;
  let m;
  while ((m = ABS_RE.exec(output)) !== null) {
    const p = m[1].trim();
    if (p) results.add(path6.normalize(path6.resolve(root, p)));
  }
  const REL_RE = /(?:^|[\s"'])((?:[\w.-]+[/\\])+[\w.-]+\.(?:java|kt|groovy|scala))(?=:\d)/gm;
  while ((m = REL_RE.exec(output)) !== null) {
    const p = m[1].trim();
    if (p) results.add(path6.normalize(path6.resolve(root, p)));
  }
  return [...results];
}
function diffAwareGateCheck(output, root, workflow, command2) {
  const changedFiles = getChangedFileAbsPaths(root);
  if (changedFiles.length === 0) return null;
  const changedSet = new Set(changedFiles.map((f) => path6.normalize(f)));
  const violationFiles = extractViolationFilePaths(output, root);
  if (violationFiles.length === 0) return null;
  const changedViolations = violationFiles.filter((f) => changedSet.has(f));
  if (changedViolations.length > 0) return null;
  const relPaths = violationFiles.map((f) => path6.relative(root, f)).slice(0, 5);
  const msg = [
    `\u2705 Code quality gate passed (diff-aware): ${changedFiles.length} changed file(s) are clean.`,
    `   Pre-existing violations in ${violationFiles.length} unchanged file(s) \u2014 not counted against this commit.`,
    `   Pre-existing: ${relPaths.join(", ")}${violationFiles.length > 5 ? ` \u2026 +${violationFiles.length - 5}` : ""}`
  ].join("\n");
  writeFieldLogEvent({
    type: "gate.passed",
    category: "code-quality",
    severity: "info",
    status: "diff-aware-pass",
    workflow,
    summary: msg,
    expected: "Code quality gate clean, or changed files are clean.",
    actual: `${violationFiles.length} pre-existing violation file(s); ${changedFiles.length} changed file(s) clean.`,
    impact: "Pre-existing violations not counted. Fix them separately as tech-debt.",
    primaryMessage: msg,
    command: command2,
    improvementKind: "incremental-quality"
  });
  return { ok: true, message: msg };
}
function quoteCommand(command2) {
  return `"${escapeForDoubleQuotedArg(command2)}"`;
}
function venvPythonPath() {
  return process.platform === "win32" ? path6.join(DPAA_VENV_DIR, "Scripts", "python.exe") : path6.join(DPAA_VENV_DIR, "bin", "python");
}
function isUsablePython(command2) {
  try {
    (0, import_node_child_process4.execSync)(`${quoteCommand(command2)} -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)"`, {
      encoding: "utf-8",
      stdio: "pipe"
    });
    return true;
  } catch {
    return false;
  }
}
function resolvePythonCommand() {
  for (const command2 of ["python", "python3"]) {
    if (isUsablePython(command2)) return command2;
  }
  throw new Error("Python >= 3.10 not found. Install Python 3.10+ or make `python`/`python3` available on PATH.");
}
function canImportDpaa(command2) {
  try {
    (0, import_node_child_process4.execSync)(`${quoteCommand(command2)} -c "import dpaa.cli"`, {
      cwd: HARNESS_ROOT3,
      encoding: "utf-8",
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONPATH: process.env.PYTHONPATH ? `${PI_ROOT2}${path6.delimiter}${process.env.PYTHONPATH}` : PI_ROOT2
      },
      stdio: "pipe"
    });
    return true;
  } catch {
    return false;
  }
}
function isUsablePip(command2) {
  try {
    (0, import_node_child_process4.execSync)(`${quoteCommand(command2)} -m pip --version`, {
      cwd: HARNESS_ROOT3,
      encoding: "utf-8",
      stdio: "pipe"
    });
    return true;
  } catch {
    return false;
  }
}
function ensureUsablePip(venvPython) {
  if (isUsablePip(venvPython)) return;
  try {
    (0, import_node_child_process4.execSync)(`${quoteCommand(venvPython)} -m ensurepip --upgrade`, {
      cwd: HARNESS_ROOT3,
      encoding: "utf-8",
      stdio: "pipe",
      maxBuffer: 1024 * 1024 * 20
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`pip repair failed for DPAA venv: ${message}`);
  }
  if (!isUsablePip(venvPython)) {
    throw new Error("pip repair failed for DPAA venv: pip is still unusable after ensurepip --upgrade");
  }
}
function createDpaaVenv(basePython) {
  fs6.mkdirSync(PI_ROOT2, { recursive: true });
  (0, import_node_child_process4.execSync)(`${quoteCommand(basePython)} -m venv ${quoteCommand(DPAA_VENV_DIR)}`, {
    cwd: HARNESS_ROOT3,
    encoding: "utf-8",
    stdio: "pipe"
  });
  const venvPython = venvPythonPath();
  ensureUsablePip(venvPython);
  return venvPython;
}
function recreateDpaaVenv(basePython) {
  fs6.rmSync(DPAA_VENV_DIR, { recursive: true, force: true });
  return createDpaaVenv(basePython);
}
function installDpaaIntoVenv(venvPython) {
  ensureUsablePip(venvPython);
  (0, import_node_child_process4.execSync)(`${quoteCommand(venvPython)} -m pip install -e ${quoteCommand(PI_ROOT2)}`, {
    cwd: HARNESS_ROOT3,
    encoding: "utf-8",
    stdio: "pipe",
    maxBuffer: 1024 * 1024 * 20
  });
}
function ensureDpaaPythonCommand() {
  const existingVenvPython = venvPythonPath();
  if (fs6.existsSync(existingVenvPython) && isUsablePython(existingVenvPython)) {
    try {
      ensureUsablePip(existingVenvPython);
      if (!canImportDpaa(existingVenvPython)) installDpaaIntoVenv(existingVenvPython);
      return existingVenvPython;
    } catch {
      const basePython2 = resolvePythonCommand();
      const recreatedVenvPython = recreateDpaaVenv(basePython2);
      installDpaaIntoVenv(recreatedVenvPython);
      return recreatedVenvPython;
    }
  }
  const basePython = resolvePythonCommand();
  const venvPython = recreateDpaaVenv(basePython);
  installDpaaIntoVenv(venvPython);
  return venvPython;
}
var skipTokens = [];
function isCoreNlpInstalled() {
  if (!fs6.existsSync(CORENLP_DIR)) return false;
  return fs6.readdirSync(CORENLP_DIR).some(
    (f) => f.startsWith("stanford-corenlp-") && f.endsWith(".jar") && !f.includes("javadoc") && !f.includes("sources") && !f.includes("models")
  );
}
function installCoreNlp() {
  const isWin = process.platform === "win32";
  const script = path6.join(PI_ROOT2, isWin ? "setup_corenlp.ps1" : "setup_corenlp.sh");
  if (!fs6.existsSync(script)) throw new Error(`CoreNLP setup script not found: ${script}`);
  const cmd = isWin ? `powershell -NoProfile -ExecutionPolicy Bypass -File "${escapeForDoubleQuotedArg(script)}"` : `bash "${escapeForDoubleQuotedArg(script)}"`;
  (0, import_node_child_process4.execSync)(cmd, { stdio: "inherit", encoding: "utf-8" });
}
function canImportSbadr(command2) {
  try {
    (0, import_node_child_process4.execSync)(`${quoteCommand(command2)} -c "import sbadr.cli"`, {
      cwd: HARNESS_ROOT3,
      encoding: "utf-8",
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONPATH: process.env.PYTHONPATH ? `${PI_ROOT2}${path6.delimiter}${process.env.PYTHONPATH}` : PI_ROOT2 },
      stdio: "pipe"
    });
    return true;
  } catch {
    return false;
  }
}
function runSbadrAnalysis(pythonCommand, planPath) {
  const reportPath = path6.join(os2.tmpdir(), `sbadr-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  let stderrOutput = "";
  try {
    (0, import_node_child_process4.execSync)(
      `${quoteCommand(pythonCommand)} -m sbadr.cli analyze "${escapeForDoubleQuotedArg(planPath)}" --output "${escapeForDoubleQuotedArg(reportPath)}" --no-text`,
      {
        cwd: HARNESS_ROOT3,
        encoding: "utf-8",
        env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONPATH: process.env.PYTHONPATH ? `${PI_ROOT2}${path6.delimiter}${process.env.PYTHONPATH}` : PI_ROOT2 },
        // Fully piped, not inherited: a child process writing straight to the
        // shared terminal fd corrupts the interactive TUI's own rendering while
        // CoreNLP is starting up (raw output appears at the bottom of the screen).
        // The "may take ~60s" console.error just before this call already tells
        // the user it is not hung, so nothing is lost by capturing stderr instead.
        stdio: "pipe"
      }
    );
  } catch (error) {
    stderrOutput = String(error?.stderr ?? "").trim();
  }
  try {
    const report = JSON.parse(fs6.readFileSync(reportPath, "utf-8"));
    return { ok: report.verdict !== "FAIL", report };
  } catch (err) {
    const readError = String(err);
    return { ok: true, report: null, error: stderrOutput ? `${readError}
${stderrOutput}` : readError };
  } finally {
    fs6.rmSync(reportPath, { force: true });
  }
}
var INTERVIEW_AMBIGUITY_THRESHOLD = 60;
function runInterviewAmbiguityGate(workflow, evidence) {
  if (!evidence || evidence.workflowId !== workflow.id) {
    writeFieldLogEvent({
      type: "gate.failed",
      category: "interview-ambiguity",
      severity: "blocker",
      workflow,
      summary: "Interview ambiguity score missing before interview \u2192 plan transition.",
      expected: "workflow_score_interview records per-dimension clarity scores before planning.",
      actual: "No score token was present for this workflow.",
      impact: "Planning could proceed from ambiguous requirements without explicit clarity scoring.",
      primaryMessage: "Call workflow_score_interview after workflow_interview_wizard completes."
    });
    return {
      ok: false,
      message: formatGateBlocked({
        gate: "Interview Ambiguity",
        why: "No interview ambiguity score has been recorded for this workflow. The LLM must call workflow_score_interview after the wizard completes.",
        next: [
          "Call workflow_score_interview with your per-dimension clarity scores (goal, scope, acceptance, constraints, context; each 0\u2013100)",
          "Re-run workflow_approve after recording the scores"
        ],
        skip: "/workflow skip interview-ambiguity <reason>"
      })
    };
  }
  if (!evidence.source || evidence.source === "chat-artifact" && !evidence.artifactSha256) {
    writeFieldLogEvent({
      type: "gate.failed",
      category: "interview-ambiguity",
      severity: "blocker",
      workflow,
      summary: "Interview clarity score lacked wizard or chat artifact source evidence.",
      expected: "workflow_score_interview is backed by completed wizard answers or a hashed chat-interview artifact.",
      actual: "Score token existed without source evidence.",
      impact: "Planning could proceed from self-assigned scores without collected requirements evidence.",
      primaryMessage: "Run workflow_interview_wizard or provide a chat-interview artifact before scoring."
    });
    return {
      ok: false,
      message: formatGateBlocked({
        gate: "Interview Ambiguity",
        why: "Interview scores were recorded without wizard completion or chat-interview artifact evidence.",
        next: [
          "Run workflow_interview_wizard and then call workflow_score_interview again",
          "Or provide a chat interview artifact path to workflow_score_interview so the evidence can be hashed",
          "Re-run workflow_approve after source-backed scores are recorded"
        ],
        skip: "/workflow skip interview-ambiguity <reason>"
      })
    };
  }
  const dims = [
    ["goal", evidence.goal],
    ["scope", evidence.scope],
    ["acceptance", evidence.acceptance],
    ["constraints", evidence.constraints],
    ["context", evidence.context]
  ];
  const failing = dims.filter(([, score]) => score < INTERVIEW_AMBIGUITY_THRESHOLD);
  if (failing.length === 0) {
    return { ok: true, message: "Interview ambiguity gate passed" };
  }
  const dimensionLines = failing.map(([name, score]) => `${name}: ${score}/100 (threshold: ${INTERVIEW_AMBIGUITY_THRESHOLD})`).join(", ");
  writeFieldLogEvent({
    type: "gate.failed",
    category: "interview-ambiguity",
    severity: "blocker",
    workflow,
    summary: `Interview ambiguity score below threshold: ${dimensionLines}.`,
    expected: `All interview clarity dimensions are ${INTERVIEW_AMBIGUITY_THRESHOLD} or above before planning.`,
    actual: dimensionLines,
    impact: "Planning could encode unclear goals, scope, acceptance criteria, constraints, or context.",
    primaryMessage: "Run a targeted follow-up interview round and re-score."
  });
  return {
    ok: false,
    message: formatGateBlocked({
      gate: "Interview Ambiguity",
      why: `One or more clarity dimensions are below the threshold (${INTERVIEW_AMBIGUITY_THRESHOLD}). Failing: ${dimensionLines}.`,
      next: [
        "Call workflow_interview_wizard again with targeted follow-up questions for the failing dimensions",
        "After the follow-up wizard, call workflow_score_interview with updated scores",
        `Re-run workflow_approve once all dimensions reach ${INTERVIEW_AMBIGUITY_THRESHOLD} or above`
      ],
      skip: "/workflow skip interview-ambiguity <reason>"
    })
  };
}
async function runPreTransitionGate(workflow, from, to, opts) {
  if (from === "interview" && to === "plan") {
    const skip = consumeSkipToken("interview-ambiguity");
    if (skip) return { ok: true, message: `Interview ambiguity gate skipped: ${skip.reason}` };
    const result = runInterviewAmbiguityGate(workflow, opts?.interviewScoreEvidence ?? null);
    return result.ok ? result : { ...result, gate: "interview-ambiguity" };
  }
  if (from === "plan_review" && to === "implement" && opts?.approvedPlanSha256) {
    const currentPlanPath = findPlanForDpaa();
    if (currentPlanPath) {
      const currentHash = sha256File(currentPlanPath);
      if (currentHash !== opts.approvedPlanSha256) {
        return {
          ok: false,
          gate: "dpaa",
          message: formatGateBlocked({
            gate: "DPAA (Stale Approval)",
            why: `The plan file has changed since DPAA was approved. Approved hash: ${opts.approvedPlanSha256.slice(0, 12)}\u2026, current hash: ${currentHash.slice(0, 12)}\u2026`,
            next: [
              "Run git diff on the plan file to identify exactly what changed since DPAA was approved",
              "Explain the changes to the user and ask whether they are intentional or accidental",
              "If intentional: keep the changes and use the workflow approval dialog again; DPAA will re-run",
              "If accidental: restore the plan to the approved version (git checkout) before continuing"
            ],
            skip: "/workflow skip dpaa <reason>"
          })
        };
      }
    }
  }
  if (from === "plan_review" && to === "implement") {
    const result = await runDpaaGate(workflow, from, to);
    return result.ok ? result : { ...result, gate: "dpaa" };
  }
  if (from === "code_review" && to === "review_approved") {
    const result = runCodeQualityGate(workflow);
    return result.ok ? result : { ...result, gate: "code-quality" };
  }
  return { ok: true, message: "" };
}
var MAX_CODE_QUALITY_ATTEMPTS = 2;
function outputTail(value, lines = 80) {
  return value.split(/\r?\n/).slice(-lines).join("\n").trim();
}
function normalizeCodeQualityError(error) {
  const err = error;
  const stdout = String(err.stdout ?? "").trim();
  const stderr = String(err.stderr ?? "").trim();
  const fallback = stdout || stderr ? "" : String(err.message ?? error ?? "").trim();
  return {
    ok: false,
    stdout,
    stderr,
    output: [stdout, stderr, fallback].filter(Boolean).join("\n").trim(),
    status: typeof err.status === "number" ? err.status : null
  };
}
function classifyCodeQualityFailure(output, status) {
  if (status == null) return "environment-error";
  if (/Compilation failed before static analysis|\bcompileJava\b|COMPILATION ERROR|cannot find symbol|\bjavac\b/i.test(output)) return "compilation-error";
  if (/\b(checkstyle|pmd|spotbugs)\b|\bviolations?\b|\bPMD\b|\bCheckstyle\b/i.test(output)) return "code-violation";
  if (/\b(jacoco|coverage|coverageGuard)\b/i.test(output)) return "coverage-failure";
  if (/\b(daemon|lock|timeout|timed out|could not start|unable to start|connection refused|out of memory|java\.io|gradle .*unavailable)\b/i.test(output)) return "environment-error";
  return "environment-error";
}
function shouldRetryCodeQualityFailure(kind) {
  return kind === "environment-error" || kind === "unknown-quality-failure";
}
function normalizeFileCommand(executable, args) {
  if (process.platform === "win32" && /\.bat$/i.test(executable)) {
    return { executable: "cmd.exe", args: ["/c", executable, ...args] };
  }
  return { executable, args };
}
function runFileCommandAttempt(executable, args, root) {
  try {
    const command2 = normalizeFileCommand(executable, args);
    const stdout = (0, import_node_child_process4.execFileSync)(command2.executable, command2.args, {
      cwd: root,
      encoding: "utf-8",
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      stdio: "pipe",
      maxBuffer: 1024 * 1024 * 10
    }).trim();
    return { ok: true, stdout, stderr: "", output: stdout, status: 0 };
  } catch (error) {
    return normalizeCodeQualityError(error);
  }
}
function gradleCompileArgs(qualityArgs) {
  const compileTasks = /* @__PURE__ */ new Set();
  for (const arg of qualityArgs) {
    const match = /^(?::(.+):)?(?:codeQualityGuard|coverageGuard|checkstyleMain|pmdMain)$/.exec(arg);
    if (match?.[1]) compileTasks.add(`:${match[1]}:compileJava`);
  }
  if (compileTasks.size === 0) compileTasks.add("compileJava");
  return [...compileTasks, "--no-daemon", "--no-build-cache"];
}
function runGradleCompilePreflight(executable, qualityArgs, root) {
  const result = runFileCommandAttempt(executable, gradleCompileArgs(qualityArgs), root);
  if (result.ok) return result;
  const prefix = "Compilation failed before static analysis. Fix compile errors before Checkstyle/PMD can be trusted.";
  return {
    ...result,
    stdout: result.stdout,
    stderr: result.stderr ? `${prefix}
${result.stderr}` : prefix,
    output: [prefix, result.output].filter(Boolean).join("\n")
  };
}
function runCodeQualityGate(workflow) {
  const skip = consumeSkipToken("code-quality");
  if (skip) {
    writeFieldLogEvent({
      type: "gate.skipped",
      category: "code-quality",
      severity: "warning",
      status: "accepted-risk",
      workflow,
      summary: "Code quality gate was skipped by explicit user approval.",
      expected: "Code quality gate runs before review_approved.",
      actual: `One-use exception consumed: ${skip.reason}`,
      impact: "Harness may need better project-specific code quality configuration if skips repeat.",
      primaryMessage: skip.reason,
      improvementKind: "doctor-check"
    });
    return { ok: true, message: `Code quality guard skipped by user approval: ${skip.reason}` };
  }
  const root = workflow.gitRoot ?? getGitRoot();
  if (!root) {
    return { ok: true, message: "Code quality guard skipped: no git root detected" };
  }
  const configured = process.env.HARNESS_CODE_QUALITY_GUARD_CMD?.trim();
  const buildSystem = detectBuildSystem(root);
  if (!configured && buildSystem.type === "unknown") {
    return { ok: true, message: "Code quality guard skipped: no recognized build system detected. Set HARNESS_CODE_QUALITY_GUARD_CMD to enable." };
  }
  if (!configured && buildSystem.qualityCommand === null) {
    return { ok: true, message: `Code quality guard skipped: no quality gate configured for ${buildSystem.type} project. Set HARNESS_CODE_QUALITY_GUARD_CMD to enable.` };
  }
  const qc = buildSystem.qualityCommand;
  const command2 = configured ?? `${qc.executable} ${qc.args.join(" ")}`;
  const runAttempt = () => {
    try {
      if (configured) {
        const stdout = (0, import_node_child_process4.execSync)(configured, {
          cwd: root,
          encoding: "utf-8",
          env: { ...process.env, PYTHONIOENCODING: "utf-8" },
          stdio: "pipe",
          maxBuffer: 1024 * 1024 * 10
        }).trim();
        return { ok: true, stdout, stderr: "", output: stdout, status: 0 };
      }
      if (buildSystem.type === "gradle") {
        const compileResult = runGradleCompilePreflight(qc.executable, qc.args, root);
        if (!compileResult.ok) return compileResult;
      }
      const eArgs = buildSystem.type === "gradle" ? [...qc.args, "--no-daemon", "--no-build-cache"] : [...qc.args];
      return runFileCommandAttempt(qc.executable, eArgs, root);
    } catch (error) {
      return normalizeCodeQualityError(error);
    }
  };
  const attempts = [];
  let classification = "unknown-quality-failure";
  for (let attempt = 1; attempt <= MAX_CODE_QUALITY_ATTEMPTS; attempt += 1) {
    const result = runAttempt();
    if (result.ok) {
      return { ok: true, message: `Code quality guard satisfied: ${command2}${attempt > 1 ? ` (after ${attempt} attempts)` : ""}` };
    }
    attempts.push(result);
    classification = classifyCodeQualityFailure(result.output, result.status);
    if (attempt < MAX_CODE_QUALITY_ATTEMPTS && shouldRetryCodeQualityFailure(classification)) continue;
    break;
  }
  const finalAttempt = attempts[attempts.length - 1] ?? { ok: false, stdout: "", stderr: "", output: "", status: null };
  const output = finalAttempt.output;
  if (classification === "code-violation" || classification === "coverage-failure") {
    const diffAware = diffAwareGateCheck(output, root, workflow, command2);
    if (diffAware) return diffAware;
  }
  const tail = outputTail(output);
  const stdoutTail = outputTail(finalAttempt.stdout, 40);
  const stderrTail = outputTail(finalAttempt.stderr, 40);
  const summary = classification === "compilation-error" ? "Compilation failed before static analysis could run." : classification === "environment-error" ? "Quality guard execution failed before violations could be verified." : "Code quality guard failed before review approval.";
  writeFieldLogEvent({
    type: "gate.failed",
    category: "code-quality",
    severity: "blocker",
    workflow,
    summary,
    expected: "Code quality guard exits successfully before code_review \u2192 review_approved.",
    actual: `Command failed: ${command2}. Classification: ${classification}. Attempts: ${attempts.length}. Exit: ${finalAttempt.status ?? "unknown"}`,
    impact: classification === "compilation-error" ? "Workflow cannot trust Checkstyle/PMD output until Java compile errors are fixed." : classification === "environment-error" ? "Workflow cannot verify Checkstyle/PMD state until the tooling/environment failure is fixed or explicitly skipped." : "Workflow cannot advance to review_approved until quality failures are fixed or explicitly skipped.",
    primaryMessage: output || `Command failed: ${command2}`,
    exitCode: finalAttempt.status ?? null,
    command: command2,
    logExcerpt: tail,
    improvementKind: "doctor-check"
  });
  return {
    ok: false,
    message: [
      formatGateBlocked({
        gate: "Code Quality",
        why: `${summary} before code_review \u2192 review_approved. Classification: ${classification}. codeQualityGuard command: ${command2}. Exit: ${finalAttempt.status ?? "unknown"}. Attempts: ${attempts.length}.`,
        next: [
          "Check which task FAILED in the output: compileJava (compilation), codeQualityGuard (Checkstyle/PMD), coverageGuard (JaCoCo coverage threshold), or environment/tooling startup.",
          "compilation-error: fix Java compile/syntax errors first. Do not treat PMD parser failures as style violations until compileJava passes.",
          "code-violation: fix the reported Checkstyle/PMD violations in source code. Do NOT edit checkstyle.xml, suppressions.xml, or add CHECKSTYLE:OFF \u2014 fix the code itself.",
          "coverage-failure: add/fix tests to meet the coverage minimum (check gradle.properties for per-module threshold).",
          "environment-error: fix Gradle/JDK/daemon/tooling setup, then rerun the transition. Do not treat this as a pass.",
          `Detected build system: ${buildSystem.type}. If no quality gate is configured, set HARNESS_CODE_QUALITY_GUARD_CMD`
        ],
        skip: "/workflow skip code-quality <reason>"
      }),
      "",
      `Classification: ${classification}`,
      `Attempts: ${attempts.length}`,
      "",
      "stdout",
      "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
      stdoutTail || "(empty)",
      "",
      "stderr",
      "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
      stderrTail || "(empty)",
      "",
      "Recent output (combined)",
      "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
      tail || "(no output)"
    ].join("\n")
  };
}
function lockPhaseTemplateFromPlanIfUnset(workflow) {
  if (workflow.phaseTemplate !== void 0) return;
  const planPath = findPlanForDpaa();
  const planTextForPolicy = planPath && fs6.existsSync(planPath) ? fs6.readFileSync(planPath, "utf-8") : "";
  workflow.phaseTemplate = parsePhaseTemplateMetadata(planTextForPolicy) ?? "full";
}
function runDpaaGate(workflow, from, to) {
  lockPhaseTemplateFromPlanIfUnset(workflow);
  const skip = consumeSkipToken("dpaa");
  if (skip) {
    writeFieldLogEvent({
      type: "gate.skipped",
      category: "dpaa",
      severity: "warning",
      status: "accepted-risk",
      workflow,
      fromPhase: from,
      toPhase: to,
      summary: "DPAA gate was skipped by explicit user approval.",
      expected: "DPAA validates the plan before implementation.",
      actual: `One-use exception consumed: ${skip.reason}`,
      impact: "Repeated DPAA skips may indicate false positives or missing workflow affordances.",
      primaryMessage: skip.reason,
      improvementKind: "dpaa-rule"
    });
    return { ok: true, message: `DPAA gate skipped by user approval: ${skip.reason}` };
  }
  const planPath = findPlanForDpaa();
  const initialPolicy = classifyAmbiguityGatePolicy(workflow);
  if (!planPath && !initialPolicy.requiresPlan) {
    writeFieldLogEvent({
      type: "gate.skipped",
      category: "dpaa",
      severity: "info",
      status: "skipped",
      workflow,
      fromPhase: from,
      toPhase: to,
      summary: "DPAA plan requirement relaxed by adaptive ambiguity policy.",
      expected: "Low-risk or discovery workflows may proceed without a machine-checkable plan.",
      actual: formatAmbiguityGatePolicy(initialPolicy),
      impact: "Implementation may proceed; maintain concise assumptions and verification in the main workflow summary.",
      primaryMessage: initialPolicy.reason,
      improvementKind: "workflow-rule"
    });
    return { ok: true, message: `DPAA advisory skipped: no plan required for this workflow. ${formatAmbiguityGatePolicy(initialPolicy)}` };
  }
  if (!planPath) {
    writeFieldLogEvent({
      type: "gate.failed",
      category: "dpaa",
      severity: "blocker",
      workflow,
      fromPhase: from,
      toPhase: to,
      summary: "DPAA gate could not find a plan file.",
      expected: "A DPAA-readable plan exists before plan_review \u2192 implement.",
      actual: "No .ai/interview/plan.md or docs/superpowers/plans/*.md was found.",
      impact: "Workflow cannot enter implementation because there is no deterministic plan input.",
      primaryMessage: "No plan file was found for DPAA.",
      improvementKind: "workflow-rule",
      targetFilesHint: ["target/.pi/extensions/workflow/artifacts.ts", "target/.pi/skills/dpaa/SKILL.md", "tests/test_workflow_prerequisites.py"]
    });
    return {
      ok: false,
      message: formatGateBlocked({
        gate: "DPAA",
        why: "No plan file was found for the required DPAA check before plan_review \u2192 implement.",
        next: ["Create `.ai/interview/plan.md` or `docs/superpowers/plans/*.md`", "Use the workflow approval dialog again"],
        skip: "/workflow skip dpaa <reason>"
      })
    };
  }
  const planTextForPolicy = fs6.existsSync(planPath) ? fs6.readFileSync(planPath, "utf-8") : "";
  const ambiguityPolicy = classifyAmbiguityGatePolicy(workflow, planTextForPolicy);
  const snapshot = createArtifactSnapshot(workflow, "dpaa", "dpaa-check-before-implementation", planPath);
  const checkedPlanPath = snapshot?.planPath ?? planPath;
  const reportPath = path6.join(os2.tmpdir(), `dpaa-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  let exitCode = 0;
  let pythonCommand;
  try {
    pythonCommand = ensureDpaaPythonCommand();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeFieldLogEvent({
      type: "gate.failed",
      category: "dpaa",
      severity: "blocker",
      workflow,
      fromPhase: from,
      toPhase: to,
      summary: "DPAA Python environment preparation failed.",
      expected: "Harness auto-creates .pi/.venv and installs DPAA dependencies.",
      actual: message,
      impact: "Workflow cannot run DPAA until Python or dependency setup is fixed.",
      primaryMessage: message,
      improvementKind: "doctor-check",
      targetFilesHint: ["target/.pi/extensions/workflow/gates.ts", "target/.pi/extensions/workflow/catalog.ts", "scripts/harness-doctor.sh", "scripts/harness-doctor.ps1"]
    });
    return {
      ok: false,
      message: formatGateBlocked({
        gate: "DPAA",
        why: `Failed to prepare DPAA Python environment: ${message}`,
        next: ["Install Python 3.10+", "Ensure `python` or `python3` is available", "Use the workflow approval dialog again"],
        skip: "/workflow skip dpaa <reason>"
      })
    };
  }
  try {
    (0, import_node_child_process4.execFileSync)(pythonCommand, ["-m", "dpaa.cli", checkedPlanPath, "--output", reportPath, "--no-text"], {
      cwd: HARNESS_ROOT3,
      encoding: "utf-8",
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONPATH: process.env.PYTHONPATH ? `${PI_ROOT2}${path6.delimiter}${process.env.PYTHONPATH}` : PI_ROOT2
      },
      stdio: "pipe"
    });
  } catch (error) {
    exitCode = typeof error.status === "number" ? error.status : 1;
  }
  let report;
  let receipt = null;
  try {
    report = JSON.parse(fs6.readFileSync(reportPath, "utf-8"));
    if (snapshot) updateSnapshotWithDpaa(snapshot, report, reportPath, exitCode);
    receipt = writeDpaaReceipt({ workflow, from, to, planPath: checkedPlanPath, reportPath, report, exitCode, snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeFieldLogEvent({
      type: "gate.failed",
      category: "dpaa",
      severity: "blocker",
      workflow,
      fromPhase: from,
      toPhase: to,
      summary: "DPAA report could not be read after execution.",
      expected: "DPAA writes a JSON report for the gate to parse.",
      actual: message,
      impact: "Workflow cannot determine whether DPAA passed or failed.",
      primaryMessage: message,
      command: `${pythonCommand} -m dpaa.cli`,
      files: [{ path: checkedPlanPath, role: "input" }],
      improvementKind: "test-coverage"
    });
    return {
      ok: false,
      message: `Failed to read DPAA report: ${message}`
    };
  } finally {
    fs6.rmSync(reportPath, { force: true });
  }
  if (report.level === "PASS") {
    if (!isCoreNlpInstalled()) {
      console.error("[harness] Stanford CoreNLP not found. Installing (~500 MB)...");
      try {
        installCoreNlp();
      } catch (err) {
        console.error(`[harness] CoreNLP install failed: ${err}. Skipping SBADR.`);
        return { ok: true, message: "DPAA check passed (SBADR skipped: CoreNLP install failed)", planSha256: sha256File(checkedPlanPath) };
      }
    }
    if (!canImportSbadr(pythonCommand)) {
      installDpaaIntoVenv(pythonCommand);
    }
    console.error("[harness] Running SBADR syntactic ambiguity analysis (CoreNLP startup may take ~60s)...");
    const sbadr = runSbadrAnalysis(pythonCommand, checkedPlanPath);
    if (!sbadr.report) {
      return { ok: true, message: `DPAA check passed (SBADR skipped: ${sbadr.error ?? "report unreadable"})`, planSha256: sha256File(checkedPlanPath) };
    }
    const sr = sbadr.report;
    const sbadrFindings = sr.findings.slice(0, 5).map(
      (f, i) => `${i + 1}. [${f.type}] "${f.sentence_text.slice(0, 90)}"
   \u2192 ${f.detail}
   \u{1F4A1} ${f.suggestion}`
    );
    if (sr.verdict === "FAIL" && !ambiguityPolicy.blocksSbadrFail) {
      writeFieldLogEvent({
        type: "gate.failed",
        category: "dpaa",
        severity: "warning",
        status: "accepted-risk",
        workflow,
        fromPhase: from,
        toPhase: to,
        summary: `SBADR FAIL treated as advisory by adaptive ambiguity policy (score=${sr.score.toFixed(3)}).`,
        expected: "Low-risk or discovery workflows do not block implementation on syntactic ambiguity alone.",
        actual: `${formatAmbiguityGatePolicy(ambiguityPolicy)}; SBADR verdict=FAIL, ambiguous=${sr.ambiguous_count}/${sr.sentence_count}`,
        impact: "Proceeding is allowed, but the LLM should repair wording when it does not change business intent.",
        primaryMessage: sr.findings[0]?.detail ?? "SBADR returned FAIL",
        improvementKind: "dpaa-rule",
        files: [{ path: checkedPlanPath, role: "input" }],
        logExcerpt: sr.findings.slice(0, 5).map((f) => `[${f.type}] ${f.detail} \u2192 ${f.suggestion}`).join("\n")
      });
      return {
        ok: true,
        message: [
          "DPAA check passed",
          "",
          `\u26A0\uFE0F  SBADR FAIL treated as advisory. ${formatAmbiguityGatePolicy(ambiguityPolicy)}`,
          "The workflow may proceed, but apply SBADR suggestions when they do not change business intent.",
          "",
          "Top Findings",
          "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
          ...sbadrFindings
        ].join("\n"),
        planSha256: sha256File(checkedPlanPath)
      };
    }
    if (sr.verdict === "FAIL") {
      writeFieldLogEvent({
        type: "gate.failed",
        category: "dpaa",
        severity: "blocker",
        workflow,
        fromPhase: from,
        toPhase: to,
        summary: `SBADR detected critical syntactic ambiguity in the English plan (score=${sr.score.toFixed(3)}).`,
        expected: "English plan sentences must be syntactically unambiguous before implementation.",
        actual: `SBADR verdict=FAIL, score=${sr.score.toFixed(3)}, ambiguous=${sr.ambiguous_count}/${sr.sentence_count} sentences`,
        impact: "Ambiguous plan sentences lead to misimplementation. Implementation is blocked until ambiguity is resolved.",
        primaryMessage: sr.findings[0]?.detail ?? "SBADR returned FAIL",
        improvementKind: "dpaa-rule",
        files: [{ path: checkedPlanPath, role: "input" }],
        logExcerpt: sr.findings.slice(0, 5).map((f) => `[${f.type}] ${f.detail} \u2192 ${f.suggestion}`).join("\n")
      });
      return {
        ok: false,
        message: [
          formatGateBlocked({
            gate: "SBADR",
            why: `SBADR detected critical syntactic ambiguity in the English plan (score=${sr.score.toFixed(3)}, ${sr.ambiguous_count}/${sr.sentence_count} sentences ambiguous). Ambiguous sentences can lead to misimplementation.`,
            next: [
              "For each SBADR finding, autonomously rewrite the ambiguous sentence using the provided suggestion \u2014 do not ask the user",
              "Update plan.ko.md first, then update plan.md as a faithful translation",
              "Retry /workflow approve immediately after rewriting all ambiguous sentences",
              "Only ask the user if a finding requires a genuine business decision that cannot be inferred from context"
            ],
            skip: "/workflow skip dpaa <reason>  (SBADR shares the dpaa gate one-use exception)"
          }),
          table([
            ["Item", "Value"],
            ["Verdict", sr.verdict],
            ["Score", sr.score.toFixed(3)],
            ["Ambiguous sentences", `${sr.ambiguous_count} / ${sr.sentence_count}`],
            ["Plan", path6.relative(process.cwd(), checkedPlanPath)]
          ]),
          "",
          "Top Findings",
          "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
          ...sbadrFindings
        ].join("\n")
      };
    }
    if (sr.verdict === "WARN") {
      return {
        ok: true,
        message: [
          "DPAA check passed",
          "",
          `\u26A0\uFE0F  SBADR WARN: potential syntactic ambiguity detected in the English plan (score=${sr.score.toFixed(3)}, ${sr.ambiguous_count}/${sr.sentence_count} sentences).`,
          "For each WARN finding, autonomously apply the suggestion to improve sentence clarity. Only surface to the user if the rewrite would change business intent.",
          "",
          "Top Findings",
          "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
          ...sbadrFindings
        ].join("\n")
      };
    }
    return { ok: true, message: "DPAA + SBADR check passed", planSha256: sha256File(checkedPlanPath) };
  }
  const findings = report.findings.slice(0, 5).map((finding, index) => {
    const line = finding.line ? `line ${finding.line}` : "line unknown";
    return `${index + 1}. [${finding.layer}/${finding.rule}] ${line}: ${finding.message}
   \u2192 ${finding.suggestion}`;
  });
  if (report.level === "WARN") {
    return {
      ok: true,
      message: [
        "DPAA advisory: WARN findings detected before implementation.",
        "The workflow may proceed, but the LLM should repair these findings when the rewrite does not change business intent.",
        table([
          ["Item", "Value"],
          ["Verdict", report.level],
          ["Penalty", String(report.overall)],
          ["Plan", path6.relative(process.cwd(), checkedPlanPath)],
          ["Receipt", receipt ? `${receipt.timestamp} / ${receipt.planSha256.slice(0, 12)}` : "not saved"],
          ["Snapshot", snapshot ? snapshot.version : "none"]
        ]),
        "",
        "Top Findings",
        "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
        ...findings
      ].join("\n"),
      planSha256: sha256File(checkedPlanPath)
    };
  }
  if (!ambiguityPolicy.blocksDpaaFail) {
    writeFieldLogEvent({
      type: "gate.failed",
      category: "dpaa",
      severity: "warning",
      status: "accepted-risk",
      workflow,
      fromPhase: from,
      toPhase: to,
      summary: `DPAA ${report.level} treated as advisory by adaptive ambiguity policy.`,
      expected: "Low-risk or discovery workflows may proceed while preserving assumptions and verification.",
      actual: `${formatAmbiguityGatePolicy(ambiguityPolicy)}; DPAA level=${report.level}, penalty=${report.overall}, findings=${report.findings.length}`,
      impact: "Proceeding is allowed, but repair non-business-changing ambiguity before or during implementation.",
      primaryMessage: report.findings[0]?.message ?? `DPAA returned ${report.level}`,
      exitCode,
      command: `${pythonCommand} -m dpaa.cli`,
      findingCodes: report.findings.map((finding) => `${finding.layer}.${finding.rule}`).slice(0, 20),
      files: [{ path: checkedPlanPath, role: "input" }],
      logExcerpt: report.findings.slice(0, 5).map((finding) => `[${finding.layer}/${finding.rule}] ${finding.message} -> ${finding.suggestion}`).join("\n"),
      improvementKind: "dpaa-rule"
    });
    return {
      ok: true,
      message: [
        `DPAA ${report.level} treated as advisory before implementation.`,
        formatAmbiguityGatePolicy(ambiguityPolicy),
        "The workflow may proceed, but the LLM should repair findings when the rewrite does not change business intent.",
        table([
          ["Item", "Value"],
          ["Verdict", report.level],
          ["Penalty", String(report.overall)],
          ["Plan", path6.relative(process.cwd(), checkedPlanPath)],
          ["Receipt", receipt ? `${receipt.timestamp} / ${receipt.planSha256.slice(0, 12)}` : "not saved"],
          ["Snapshot", snapshot ? snapshot.version : "none"]
        ]),
        "",
        "Top Findings",
        "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
        ...findings
      ].join("\n"),
      planSha256: sha256File(checkedPlanPath)
    };
  }
  writeFieldLogEvent({
    type: "gate.failed",
    category: "dpaa",
    severity: "blocker",
    workflow,
    fromPhase: from,
    toPhase: to,
    summary: `DPAA returned ${report.level} before implementation.`,
    expected: "DPAA FAIL blocks plan_review \u2192 implement.",
    actual: `DPAA level=${report.level}, penalty=${report.overall}, findings=${report.findings.length}`,
    impact: "Implementation is blocked until the plan/spec ambiguity is resolved or explicitly skipped.",
    primaryMessage: report.findings[0]?.message ?? `DPAA returned ${report.level}`,
    exitCode,
    command: `${pythonCommand} -m dpaa.cli`,
    findingCodes: report.findings.map((finding) => `${finding.layer}.${finding.rule}`).slice(0, 20),
    files: [{ path: checkedPlanPath, role: "input" }],
    logExcerpt: report.findings.slice(0, 5).map((finding) => `[${finding.layer}/${finding.rule}] ${finding.message} -> ${finding.suggestion}`).join("\n"),
    improvementKind: "dpaa-rule"
  });
  return {
    ok: false,
    message: [
      formatGateBlocked({
        gate: "DPAA",
        why: `DPAA returned ${report.level} before plan_review \u2192 implement.`,
        next: [
          "For each finding, autonomously fix vague phrasing, passive voice, undefined pronouns, hedging language, missing metrics, and placeholder text \u2014 do not ask the user",
          "Update plan.ko.md first, then update plan.md as a faithful translation ensuring every requirement matches",
          "Retry /workflow approve immediately after all fixes are applied",
          "Only ask the user if a finding requires a genuine business decision \u2014 i.e., when multiple valid behaviors are possible and context alone cannot resolve the ambiguity"
        ],
        skip: "/workflow skip dpaa <reason>"
      }),
      table([
        ["Item", "Value"],
        ["Verdict", report.level],
        ["Penalty", String(report.overall)],
        ["Plan", path6.relative(process.cwd(), checkedPlanPath)],
        ["Receipt", receipt ? `${receipt.timestamp} / ${receipt.planSha256.slice(0, 12)}` : "not saved"],
        ["Snapshot", snapshot ? snapshot.version : "none"]
      ]),
      "",
      "Top Findings",
      "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
      ...findings
    ].join("\n")
  };
}
function validateWorkflowWorkspace(workflow) {
  const actualCwd = process.cwd();
  const actualGitRoot = getGitRoot();
  const actualBranch = actualGitRoot ? getBranch(actualGitRoot) : "unknown";
  if (!workflow) return { ok: true, actualCwd, actualGitRoot, actualBranch, problems: [] };
  const problems = [];
  if (workflow.gitRoot && actualGitRoot && path6.resolve(workflow.gitRoot) !== path6.resolve(actualGitRoot)) {
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
function consumeSkipToken(gate) {
  const now = Date.now();
  const index = skipTokens.findIndex((token2) => token2.gate === gate && token2.expiresAt > now);
  if (index < 0) {
    for (let i = skipTokens.length - 1; i >= 0; i -= 1) {
      if (skipTokens[i].expiresAt <= now) skipTokens.splice(i, 1);
    }
    return null;
  }
  const [token] = skipTokens.splice(index, 1);
  return { reason: token.reason };
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

// target/.pi/extensions/workflow/checkpoints.ts
function createWorkspaceCheckpoint(workflow, reason) {
  const root = workflow.gitRoot;
  if (!root || !fs7.existsSync(root)) return void 0;
  const MAX = 100 * 1024 * 1024;
  let stagedPatch;
  let unstagedPatch;
  let untracked;
  try {
    stagedPatch = (0, import_node_child_process5.execFileSync)("git", ["-C", root, "diff", "--binary", "--cached"], { maxBuffer: MAX });
    unstagedPatch = (0, import_node_child_process5.execFileSync)("git", ["-C", root, "diff", "--binary"], { maxBuffer: MAX });
    untracked = (0, import_node_child_process5.execFileSync)("git", ["-C", root, "ls-files", "--others", "--exclude-standard", "-z"], { encoding: "utf-8", maxBuffer: MAX }).split("\0").filter(Boolean);
  } catch {
    return void 0;
  }
  const id = `${Date.now()}-${slugify(reason)}`;
  const dir = path7.join(getWorkspaceCheckpointRoot(workflow.id), id);
  fs7.mkdirSync(dir, { recursive: true });
  fs7.writeFileSync(path7.join(dir, "staged.patch"), stagedPatch);
  fs7.writeFileSync(path7.join(dir, "unstaged.patch"), unstagedPatch);
  const untrackedDir = path7.join(dir, "untracked");
  for (const relative3 of untracked) {
    const source = path7.join(root, relative3);
    if (!fs7.existsSync(source) || !fs7.statSync(source).isFile()) continue;
    const target = path7.join(untrackedDir, relative3);
    fs7.mkdirSync(path7.dirname(target), { recursive: true });
    fs7.copyFileSync(source, target);
  }
  fs7.writeFileSync(path7.join(dir, "meta.json"), JSON.stringify({
    workflowId: workflow.id,
    reason,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    gitRoot: root,
    branch: workflow.branch,
    untracked
  }, null, 2), "utf-8");
  return dir;
}
function getWorkspaceCheckpointRoot(workflowId) {
  return path7.join(getWorkflowStateDir(), "workspace-checkpoints", workflowId);
}

// target/.pi/extensions/workflow/policy-core.ts
var fs8 = __toESM(require("node:fs"));
var path8 = __toESM(require("node:path"));
var PROJECT_ROOT = path8.resolve(__dirname, "../../..");
var POLICY_FILE = path8.join(PROJECT_ROOT, ".harness", "workflow-policy.json");
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
    const parsed = JSON.parse(fs8.readFileSync(POLICY_FILE, "utf-8"));
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
function isSharedAutoAdvancePhase(phase) {
  return loadSharedWorkflowPolicy().autoAdvanceFromPhases.includes(phase);
}
function isSharedTransitionAllowed(from, to, phaseTemplate) {
  const policy = loadSharedWorkflowPolicy().transitionPolicy;
  if (policy.strictNextPhaseOnly || policy.forbidSkippedPhases) return sharedNextPhase(from, phaseTemplate) === to;
  return isSharedWorkflowPhase(from) && isSharedWorkflowPhase(to);
}
var READ_ONLY_BUILTIN = ["read", "bash", "grep", "find", "ls"];
var WRITE_BUILTIN = ["write", "edit"];
var ALL_BUILTIN = [...READ_ONLY_BUILTIN, ...WRITE_BUILTIN];

// target/.pi/extensions/workflow/ledger.ts
var import_node_child_process6 = require("node:child_process");
var fs9 = __toESM(require("node:fs"));
var path9 = __toESM(require("node:path"));
var MAX_CHANGED_FILES = 20;
function getWorkflowLedgerPath(workflow, root = process.cwd()) {
  return path9.join(root, ".ai", "interview", "runs", workflow.id, "ledger.json");
}
function createWorkflowLedgerSnapshot(workflow, update = {}) {
  const lastTransition = workflow.history.at(-1);
  const taskCounts = summarizeTaskCounts(workflow);
  const activeTask = workflow.taskQueue?.activeTaskId ? workflow.taskQueue.tasks.find((task) => task.id === workflow.taskQueue?.activeTaskId) : void 0;
  const changedFiles = Array.from(new Set((update.changedFiles ?? collectChangedFiles(workflow.gitRoot ?? workflow.cwd)).map((file) => file.replace(/\\/g, "/"))));
  const artifactPaths = (update.planArtifactPaths ?? defaultPlanArtifactPaths()).map((item) => item.replace(/\\/g, "/"));
  const verificationCoverage = createVerificationCoverage(workflow, artifactPaths, update.verification);
  const reviewSummary = update.review ? {
    critical: update.review.critical,
    major: update.review.major,
    minor: update.review.minor,
    reviewedFileCount: update.review.reviewedFiles?.length ?? update.review.reviewedFileCount
  } : void 0;
  const baseSnapshot = {
    schemaVersion: 1,
    workflowId: workflow.id,
    title: workflow.title,
    branch: workflow.branch,
    cwd: workflow.cwd,
    gitRoot: workflow.gitRoot,
    phase: {
      current: workflow.phase,
      historyCount: workflow.history.length,
      lastTransition: lastTransition ? {
        from: lastTransition.from,
        to: lastTransition.to,
        reason: truncate(lastTransition.reason, 160),
        timestamp: lastTransition.timestamp
      } : void 0
    },
    startedAt: new Date(workflow.startedAt).toISOString(),
    updatedAt: new Date(workflow.updatedAt).toISOString(),
    planCoverage: {
      artifactPaths,
      taskCounts,
      activeTask: activeTask ? {
        id: activeTask.id,
        title: truncate(activeTask.title, 160),
        acceptanceCount: activeTask.acceptanceCriteria.length,
        verificationCount: activeTask.verification.length
      } : void 0
    },
    diffCoverage: {
      changedFileCount: changedFiles.length,
      changedFiles: changedFiles.slice(0, MAX_CHANGED_FILES),
      truncated: changedFiles.length > MAX_CHANGED_FILES
    },
    verification: {
      commandCount: update.verification ? 1 : 0,
      lastCommand: update.verification ? {
        commandId: update.verification.commandId,
        ok: update.verification.ok,
        exitCode: update.verification.exitCode,
        artifactPath: update.verification.artifactPath?.replace(/\\/g, "/")
      } : void 0
    },
    verificationCoverage,
    review: {
      submitted: Boolean(update.review),
      summary: reviewSummary
    },
    nextSafeAction: {
      phase: workflow.phase,
      summary: summarizeNextSafeAction(workflow.phase, update)
    }
  };
  const snapshot = {
    ...baseSnapshot,
    resume: { summary: "", generatedAt: new Date(workflow.updatedAt).toISOString() }
  };
  snapshot.resume.summary = formatWorkflowLedgerResumeSummary(snapshot);
  return snapshot;
}
function writeWorkflowLedgerSnapshot(workflow, root = workflow.gitRoot ?? process.cwd(), update = {}) {
  const file = getWorkflowLedgerPath(workflow, root);
  const previous = readExistingLedger(file);
  const mergedUpdate = {
    planArtifactPaths: update.planArtifactPaths ?? previous?.planCoverage?.artifactPaths,
    changedFiles: update.changedFiles,
    verification: update.verification ?? previous?.verification?.lastCommand,
    review: update.review ?? (previous?.review?.summary ? { ...previous.review.summary } : void 0)
  };
  const snapshot = createWorkflowLedgerSnapshot(workflow, mergedUpdate);
  fs9.mkdirSync(path9.dirname(file), { recursive: true });
  fs9.writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}
`, "utf-8");
  return { path: file, workflowId: workflow.id, updatedAt: snapshot.updatedAt };
}
function safeWriteWorkflowLedgerSnapshot(workflow, root, update = {}) {
  if (!workflow) return null;
  try {
    return writeWorkflowLedgerSnapshot(workflow, root ?? workflow.gitRoot ?? process.cwd(), update);
  } catch {
    return null;
  }
}
function formatWorkflowLedgerResumeSummary(snapshot) {
  const verification = snapshot.verification.lastCommand ? `${snapshot.verification.lastCommand.commandId}:${snapshot.verification.lastCommand.ok ? "pass" : "fail"}` : "none";
  const review = snapshot.review.summary ? `Cr${snapshot.review.summary.critical}/Maj${snapshot.review.summary.major}/Min${snapshot.review.summary.minor}` : "none";
  const counts = snapshot.verificationCoverage?.counts ?? { covered: 0, needsVerification: 0, unknown: 0 };
  return [
    `phase=${snapshot.phase.current}`,
    `verification=${verification}`,
    `coverage=${counts.covered}/${counts.needsVerification}/${counts.unknown}`,
    `review=${review}`,
    `diff=${snapshot.diffCoverage.changedFileCount}`,
    `next=${truncate(snapshot.nextSafeAction.summary, 180)}`
  ].join("; ");
}
function summarizeTaskCounts(workflow) {
  if (!workflow.taskQueue) return { none: 1, pending: 0, active: 0, done: 0, blocked: 0, deferred: 0 };
  return workflow.taskQueue.tasks.reduce((acc, task) => {
    acc[task.status] = (acc[task.status] ?? 0) + 1;
    return acc;
  }, { none: 0, pending: 0, active: 0, done: 0, blocked: 0, deferred: 0 });
}
function defaultPlanArtifactPaths() {
  return [".ai/interview/spec.ko.md", ".ai/interview/spec.md", ".ai/interview/plan.ko.md", ".ai/interview/plan.md"];
}
function createVerificationCoverage(workflow, artifactPaths, verification) {
  const activeTask = workflow.taskQueue?.activeTaskId ? workflow.taskQueue.tasks.find((task) => task.id === workflow.taskQueue?.activeTaskId) : void 0;
  const evidence = verification ? [`${verification.commandId}:${verification.ok ? "pass" : "fail"}`] : [];
  const status = verification ? verification.ok ? "covered" : "needs_verification" : "unknown";
  const items = activeTask?.acceptanceCriteria.length ? activeTask.acceptanceCriteria.map((label, index) => ({
    id: `${activeTask.id}:acceptance:${index + 1}`,
    label: truncate(label, 160),
    status,
    evidence
  })) : [
    {
      id: "plan-artifacts",
      label: "Plan artifacts available",
      status: artifactPaths.length > 0 ? "covered" : "unknown",
      evidence: artifactPaths.length > 0 ? [`planArtifacts:${artifactPaths.length}`] : []
    },
    {
      id: "latest-verification",
      label: "Latest verification evidence",
      status,
      evidence
    }
  ];
  return { items, counts: countCoverageItems(items) };
}
function countCoverageItems(items) {
  return items.reduce((acc, item) => {
    if (item.status === "needs_verification") acc.needsVerification += 1;
    else acc[item.status] += 1;
    return acc;
  }, { covered: 0, needsVerification: 0, unknown: 0 });
}
function collectChangedFiles(root) {
  try {
    const output = (0, import_node_child_process6.execFileSync)("git", ["-C", root, "status", "--short"], { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
    return output.split(/\r?\n/).filter((line) => line.trim()).map((line) => line.slice(3).trim().replace(/^(.+)\s+->\s+(.+)$/, "$2")).filter((file) => file && !isGeneratedWorkflowArtifactPath(file));
  } catch {
    return [];
  }
}
function isGeneratedWorkflowArtifactPath(file) {
  const normalized = file.replace(/\\/g, "/");
  return normalized === ".ai" || normalized === ".ai/" || normalized.startsWith(".ai/") || normalized === ".project-memory" || normalized === ".project-memory/" || normalized.startsWith(".project-memory/");
}
function summarizeNextSafeAction(phase, update) {
  const hasVerification = Boolean(update.verification);
  const hasReview = Boolean(update.review);
  if (phase === "implement" && !hasVerification) return "implement: run targeted verification for current changes before code_review.";
  if (phase === "implement") return "implement: verification evidence exists; finish the approved scope and advance to code_review.";
  if (phase === "code_review" && !hasReview) return "code_review: collect self-review, independent review, and quality gate evidence before submit_review_package.";
  if (phase === "code_review") return "code_review: review evidence exists; submit the review package when quality evidence is complete.";
  if (phase === "commit" && !hasVerification) return "commit: check verification evidence before staging and committing.";
  const actions = {
    interview: "interview: clarify requirements and record interview score evidence.",
    plan: "plan: write DPAA-ready spec and plan artifacts, then advance to plan_review.",
    plan_review: "plan_review: run DPAA/SBADR and repair plan ambiguity before implementation.",
    implement: "implement: complete approved scope, collect verification evidence, then advance to code_review.",
    code_review: "code_review: collect self-review, independent review, and quality gate evidence before submitting review package.",
    review_approved: "review_approved: prepare documentation updates for the approved changes.",
    document: "document: update required docs and prepare commit summary.",
    commit: "commit: stage reviewed changes and create the approved commit.",
    push: "push: run the guarded git-push command and observe success.",
    done: "done: workflow is complete."
  };
  return actions[phase];
}
function readExistingLedger(file) {
  try {
    return JSON.parse(fs9.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}
function truncate(value, max) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}\u2026`;
}

// target/.pi/extensions/workflow/state.ts
function createWorkflow(title) {
  const now = Date.now();
  const gitRoot = getGitRoot();
  return {
    id: `wf-${new Date(now).toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-")}`,
    title: title || "workflow",
    phase: "interview",
    cwd: process.cwd(),
    gitRoot,
    branch: gitRoot ? getBranch(gitRoot) : "unknown",
    history: [],
    undone: [],
    startedAt: now,
    updatedAt: now
  };
}
function getNextPhase(phase, phaseTemplate) {
  return sharedNextPhase(phase, phaseTemplate);
}
function transitionWorkflow(workflow, to, reason) {
  const from = workflow.phase;
  if (from !== to) {
    workflow.history.push({
      from,
      to,
      reason,
      timestamp: Date.now(),
      checkpointBefore: createWorkspaceCheckpoint(workflow, `${from}-to-${to}`)
    });
    workflow.undone = [];
  }
  workflow.phase = to;
  workflow.updatedAt = Date.now();
}
async function advanceWorkflow(workflow, reason, opts) {
  if (!workflow) return { ok: false, message: "\uC9C4\uD589 \uC911\uC778 workflow\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. /workflow start \uB97C \uBA3C\uC800 \uC2E4\uD589\uD558\uC138\uC694." };
  const workspace = validateWorkflowWorkspace(workflow);
  if (!workspace.ok) return { ok: false, message: formatWorkspaceMismatch(workspace) };
  const transitions = [];
  while (true) {
    const from = workflow.phase;
    if (from === "push") {
      return { ok: false, message: "Push phase requires an observed successful git push. Run git push; the workflow will advance to done only after the push succeeds." };
    }
    const next = getNextPhase(from, workflow.phaseTemplate);
    if (!next) {
      if (transitions.length === 0) return { ok: false, message: `\uC774\uBBF8 \uB9C8\uC9C0\uB9C9 \uB2E8\uACC4\uC785\uB2C8\uB2E4: ${workflow.phase}` };
      break;
    }
    if (!isSharedTransitionAllowed(from, next, workflow.phaseTemplate)) {
      return { ok: false, message: `Workflow transition blocked by policy: ${from} \u2192 ${next}` };
    }
    const gate = await runPreTransitionGate(workflow, from, next, opts);
    if (!gate.ok) {
      if (transitions.length === 0) return { ok: false, message: gate.message, gate: gate.gate };
      break;
    }
    transitionWorkflow(workflow, next, reason);
    transitions.push({ from, to: next, message: gate.message, planSha256: gate.planSha256 });
    if (next === "implement" && workflow.implementCheckpointBaseCommit === void 0) {
      try {
        const head = (0, import_node_child_process7.execFileSync)("git", ["rev-parse", "HEAD"], { cwd: workflow.gitRoot ?? void 0, encoding: "utf-8" }).trim();
        workflow.implementCheckpointBaseCommit = head;
      } catch {
      }
    }
    if (from === "plan_review" || from === "commit") break;
    if (next === "plan_review" || next === "code_review" || next === "commit" || next === "push") break;
    if (!isSharedAutoAdvancePhase(from) && !isSharedAutoAdvancePhase(next)) break;
  }
  saveWorkflow(workflow);
  const path11 = transitions.map((item, index) => index === 0 ? `${item.from} \u2192 ${item.to}` : `\u2192 ${item.to}`).join(" ");
  return { ok: true, message: `Workflow \uC804\uC774: ${path11}`, transitions };
}
function loadPersistedWorkflow() {
  const file = getWorkflowStatePath();
  if (!fs10.existsSync(file)) return null;
  try {
    const workflow = JSON.parse(fs10.readFileSync(file, "utf-8"));
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
function saveWorkflow(workflow) {
  const file = getWorkflowStatePath();
  fs10.mkdirSync(getWorkflowStateDir(), { recursive: true });
  fs10.writeFileSync(file, JSON.stringify(workflow, null, 2), "utf-8");
  safeWriteWorkflowLedgerSnapshot(workflow);
}
function clearPersistedWorkflow() {
  fs10.rmSync(getWorkflowStatePath(), { force: true });
}

// target/.pi/extensions/workflow/format.ts
function formatWorkflowStatus(workflow) {
  if (!workflow) {
    return [
      banner("\u26AA Workflow \uC5C6\uC74C"),
      "\uC2DC\uC791: /workflow start <\uBAA9\uD45C>"
    ].join("\n");
  }
  const next = getNextPhase(workflow.phase, workflow.phaseTemplate);
  const ws = validateWorkflowWorkspace(workflow);
  return [
    banner("\u{1F9ED} Workflow \uC0C1\uD0DC"),
    table([
      ["\uD56D\uBAA9", "\uAC12"],
      ["\uBAA9\uD45C", workflow.title],
      ["\uD604\uC7AC \uB2E8\uACC4", workflow.phase],
      ["\uB2E4\uC74C \uB2E8\uACC4", next ?? "\uC5C6\uC74C"],
      ["\uBE0C\uB79C\uCE58", workflow.branch],
      ["\uC791\uC5C5\uACF5\uAC04", ws.ok ? "\uC815\uC0C1" : "\u26A0\uFE0F \uBD88\uC77C\uCE58"],
      ["\uC2E4\uD589 \uCDE8\uC18C", workflow.history.length > 0 ? `${workflow.history.length}\uAC1C \uC0AC\uC6A9 \uAC00\uB2A5` : "\uC5C6\uC74C"]
    ]),
    "",
    formatPhaseGuidanceForUser(workflow)
  ].join("\n");
}
function formatPhaseGuidanceForUser(workflow) {
  const next = getNextPhase(workflow.phase, workflow.phaseTemplate);
  const lines = [];
  switch (workflow.phase) {
    case "interview":
      lines.push("\uC694\uAD6C\uC0AC\uD56D \uC815\uB9AC \uC911. \uC644\uB8CC \uD6C4 plan \u2192 plan_review \uB85C \uC790\uB3D9 \uC9C4\uD589\uB429\uB2C8\uB2E4.");
      break;
    case "plan":
      lines.push("\uD50C\uB79C \uC791\uC131 \uC911. \uC644\uB8CC \uD6C4 plan_review \uB85C \uC790\uB3D9 \uC9C4\uD589\uB429\uB2C8\uB2E4.");
      break;
    case "plan_review":
      lines.push("\uD50C\uB79C \uAC80\uD1A0 \uC911\uC785\uB2C8\uB2E4. workflow_approve\uB97C \uC2E4\uD589\uD558\uBA74 DPAA/SBADR \uAC80\uC0AC\uB97C \uAC70\uCCD0 \uAD6C\uD604 \uB2E8\uACC4\uB85C \uC790\uB3D9 \uC804\uC774\uD569\uB2C8\uB2E4.");
      break;
    case "implement":
      lines.push("\uAD6C\uD604 \uC911. \uC644\uB8CC \uD6C4 code_review \uB85C \uC790\uB3D9 \uC9C4\uD589\uB429\uB2C8\uB2E4.");
      break;
    case "code_review":
      lines.push("\uCF54\uB4DC \uB9AC\uBDF0 \uC911. submit_review_package \uC644\uB8CC \uD6C4 review_approved \uB85C \uC9C4\uD589\uB429\uB2C8\uB2E4.");
      break;
    case "review_approved":
      lines.push("\uB9AC\uBDF0 \uC644\uB8CC. \uBB38\uC11C\uD654 \u2192 commit \uC900\uBE44\uB85C \uC790\uB3D9 \uC9C4\uD589\uB429\uB2C8\uB2E4.");
      break;
    case "document":
      lines.push("\uBB38\uC11C\uD654 \uC911. \uC644\uB8CC \uD6C4 commit \uC900\uBE44\uB85C \uC790\uB3D9 \uC9C4\uD589\uB429\uB2C8\uB2E4.");
      break;
    case "commit":
      lines.push("\uCEE4\uBC0B \uC900\uBE44 \uC644\uB8CC. workflow_approve \uB85C push \uB2E8\uACC4\uB85C \uC9C4\uC785\uD558\uC138\uC694.");
      break;
    case "push":
      lines.push("Push \uC900\uBE44 \uC644\uB8CC. workflow_run_command git-push \uB85C git push \uB97C \uC2E4\uD589\uD558\uC138\uC694.");
      break;
    case "done":
      lines.push("\u2705 \uC644\uB8CC\uB410\uC2B5\uB2C8\uB2E4.");
      break;
  }
  if (next && workflow.phase !== "done") {
    lines.push(`\uB2E4\uC74C \uB2E8\uACC4: ${next}`);
  }
  return lines.join("\n");
}

// target/.claude/hooks/src/lib/skip-tokens.ts
var fs11 = __toESM(require("node:fs"));
var path10 = __toESM(require("node:path"));
var SKIP_TOKEN_TTL_MS = 10 * 60 * 1e3;
function skipTokensPath() {
  return path10.join(getWorkflowStateDir(), "claude-skip-tokens.json");
}
function readTokens(now) {
  try {
    const raw = fs11.readFileSync(skipTokensPath(), "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((token) => token.expiresAt > now);
  } catch {
    return [];
  }
}
function writeTokens(tokens) {
  const file = skipTokensPath();
  fs11.mkdirSync(path10.dirname(file), { recursive: true });
  fs11.writeFileSync(file, JSON.stringify(tokens, null, 2), "utf-8");
}
function addClaudeSkipToken(gate, workflowId, reason) {
  const now = Date.now();
  const tokens = readTokens(now);
  tokens.push({ gate, workflowId, reason, issuedAt: now, expiresAt: now + SKIP_TOKEN_TTL_MS });
  writeTokens(tokens);
}

// target/.claude/hooks/src/workflow-cli.ts
var [, , command, ...rest] = process.argv;
function cmdStart(title) {
  const existing = loadPersistedWorkflow();
  if (existing && existing.phase !== "done") {
    console.log(`Workflow already active: [${existing.phase}] ${existing.title}
Use /workflow status or /workflow abort first.`);
    process.exitCode = 1;
    return;
  }
  const workflow = createWorkflow(title || "workflow");
  saveWorkflow(workflow);
  console.log(formatWorkflowStatus(workflow));
}
function cmdStatus() {
  console.log(formatWorkflowStatus(loadPersistedWorkflow()));
}
async function cmdApprove() {
  const workflow = loadPersistedWorkflow();
  if (!workflow) {
    console.log("No active workflow to approve.");
    process.exitCode = 1;
    return;
  }
  const result = await advanceWorkflow(workflow, "user_approved", {});
  console.log(result.message);
  if (!result.ok) process.exitCode = 1;
}
function cmdDoctor() {
  console.log(formatHarnessDoctor());
}
function cmdAbort() {
  const workflow = loadPersistedWorkflow();
  if (!workflow) {
    console.log("No active workflow to abort.");
    process.exitCode = 1;
    return;
  }
  clearPersistedWorkflow();
  console.log(`Workflow aborted: [${workflow.phase}] ${workflow.title}`);
}
function cmdState(phaseArg) {
  const workflow = loadPersistedWorkflow();
  if (!workflow) {
    console.log("No active workflow.");
    process.exitCode = 1;
    return;
  }
  if (!phaseArg) {
    console.log("Usage: /workflow state <phase>");
    process.exitCode = 1;
    return;
  }
  const phase = normalizeWorkflowPhase(phaseArg);
  if (!WORKFLOW_PHASES.includes(phase)) {
    console.log(`Unknown phase: ${phaseArg}. Valid phases: ${WORKFLOW_PHASES.join(", ")}`);
    process.exitCode = 1;
    return;
  }
  workflow.phase = phase;
  workflow.updatedAt = Date.now();
  saveWorkflow(workflow);
  console.log(`Manually set workflow phase to: ${phase}. This bypasses gates \u2014 use only for recovery, per the same caveat as Pi's /workflow state.`);
}
function cmdSkip(args) {
  const [gate, ...reasonParts] = args;
  const reason = reasonParts.join(" ").trim();
  if (!gate || !reason) {
    console.log("Usage: /workflow skip <gate> <reason>");
    process.exitCode = 1;
    return;
  }
  const workflow = loadPersistedWorkflow();
  if (!workflow) {
    console.log("No active workflow to skip a gate for.");
    process.exitCode = 1;
    return;
  }
  addClaudeSkipToken(gate, workflow.id, reason);
  console.log(`Skip token issued for gate '${gate}' (valid 10 minutes, workflow ${workflow.id}). Use only for an accepted, explicit risk.`);
}
function cmdDpaaAudit() {
  console.log(formatLatestDpaaAudit());
}
function cmdFailures(sub) {
  if (sub === "export") {
    console.log(`Harness field logs exported: ${exportFieldLogs()}`);
    return;
  }
  console.log(formatRecentFieldLogs(10));
}
async function main() {
  switch (command) {
    case "start":
      return cmdStart(rest.join(" ").trim());
    case "status":
      return cmdStatus();
    case "approve":
      return cmdApprove();
    case "doctor":
      return cmdDoctor();
    case "abort":
      return cmdAbort();
    case "state":
      return cmdState(rest[0]);
    case "skip":
      return cmdSkip(rest);
    case "dpaa-audit":
      return cmdDpaaAudit();
    case "failures":
      return cmdFailures(rest[0]);
    default:
      console.log("Usage: workflow-cli.cjs start|status|approve|doctor|abort|state|skip|dpaa-audit|failures [export]");
      process.exitCode = 1;
  }
}
main();
