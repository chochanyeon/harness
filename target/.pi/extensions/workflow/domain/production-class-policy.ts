import * as fs from "node:fs";
import * as path from "node:path";

export type ProductionClassTddDecision =
  | { action: "allow" }
  | { action: "block"; reasonLines: string[] }
  | { action: "steer"; message: string };

export type ProductionClassTddInput = {
  className: string;
  testPath: string;
  isNewFile: boolean;
  hasTestCoverage: boolean;
};

const TDD_TEST_FIRST_INSTRUCTIONS = [
  "[INSTRUCTION] do not ask the user for approval to create or update this test.",
  "Writing/updating the required test is pre-approved as part of the implementation scope.",
  "This is not scope expansion.",
  "Next action: create/update the failing test, then retry the production edit and continue GREEN → REFACTOR.",
];

/**
 * Returns true for Java production classes that should be covered by the TDD gate.
 * DTO/entity/repository/config-style artifacts are intentionally excluded because
 * they are usually exercised through service/controller tests rather than direct
 * test-first class creation.
 */
export function isProductionClassPath(filePath: string, gitRoot: string): boolean {
  const normalized = repoRelativePath(filePath, gitRoot);
  if (!/^src\/main\/java\/.+\.java$/.test(normalized)) return false;
  if (/(^|\/)(dto|entity|model|repository)\//.test(normalized)) return false;
  const className = path.basename(normalized, ".java");
  if (/^Q[A-Z]|^Migration/.test(className)) return false;
  const EXCLUDE = /(Entity|Dto|VO|Vo|Request|Response|Payload|Config|Configuration|Application|Properties|Settings|Exception|Error|Enum|Record|Constants|Constant|Event|Message|Projection|Form)$/i;
  return !EXCLUDE.test(className);
}

export function decideProductionClassTddGate(input: ProductionClassTddInput): ProductionClassTddDecision {
  if (input.hasTestCoverage) return { action: "allow" };
  return {
    action: "block",
    reasonLines: [
      `🧪 TDD: ${input.className}Test.java를 먼저 작성하세요.`,
      input.isNewFile
        ? "새 클래스를 작성하기 전에 테스트를 먼저 작성하세요."
        : "기존 production behavior class를 수정하기 전에 관련 테스트를 먼저 작성하거나 갱신하세요.",
      `예상 테스트 경로: ${input.testPath}`,
      ...TDD_TEST_FIRST_INSTRUCTIONS,
    ],
  };
}

export function expectedProductionTestPath(filePath: string, gitRoot: string): string {
  const normalized = repoRelativePath(filePath, gitRoot);
  return path.join(gitRoot, normalized
    .replace(/^src\/main\/java\//, "src/test/java/")
    .replace(/\.java$/, "Test.java"));
}

export function productionClassKey(filePath: string, gitRoot: string): string {
  return repoRelativePath(filePath, gitRoot);
}

export function productionClassKeyFromTestPath(filePath: string, gitRoot: string): string | null {
  const normalized = repoRelativePath(filePath, gitRoot);
  const match = /^src\/test\/java\/(.+?)(IntegrationTest|Tests|Test|IT)\.java$/.exec(normalized);
  if (!match) return null;
  return `src/main/java/${match[1]}.java`;
}

export function isProductionClassTestPath(filePath: string, gitRoot: string): boolean {
  return productionClassKeyFromTestPath(filePath, gitRoot) !== null;
}

export function hasProductionClassTestCoverage(filePath: string, gitRoot: string): boolean {
  const normalized = repoRelativePath(filePath, gitRoot);
  const testRelPath = normalized.replace(/^src\/main\/java\//, "src/test/java/");
  const testDir = path.join(gitRoot, path.dirname(testRelPath));
  const className = path.basename(normalized, ".java");
  if (!fs.existsSync(testDir)) return false;

  const directCandidates = [
    `${className}Test.java`,
    `${className}Tests.java`,
    `${className}IT.java`,
    `${className}IntegrationTest.java`,
  ];
  if (directCandidates.some((candidate) => fs.existsSync(path.join(testDir, candidate)))) return true;

  return hasRelatedNestedTest(testDir, className, 2);
}

function hasRelatedNestedTest(dir: string, className: string, depth: number): boolean {
  if (depth < 0 || !fs.existsSync(dir)) return false;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && hasRelatedNestedTest(fullPath, className, depth - 1)) return true;
    if (entry.isFile() && isRelatedTestFile(entry.name, className)) return true;
  }
  return false;
}

function isRelatedTestFile(fileName: string, className: string): boolean {
  return new RegExp(`^${escapeRegExp(className)}(Test|Tests|IT|IntegrationTest)\\.java$`).test(fileName);
}

/**
 * Returns true for Go production files that should be covered by the TDD gate.
 * Test files (_test.go) and vendored dependencies (vendor/) are excluded because
 * they are not first-party production code.
 */
export function isProductionGoPath(filePath: string, gitRoot: string): boolean {
  const normalized = repoRelativePath(filePath, gitRoot);
  if (!normalized.endsWith(".go")) return false;
  if (normalized.endsWith("_test.go")) return false;
  if (/(^|\/)vendor\//.test(normalized)) return false;
  return true;
}

export function decideProductionGoTddGate(input: ProductionClassTddInput): ProductionClassTddDecision {
  if (input.hasTestCoverage) return { action: "allow" };
  return {
    action: "block",
    reasonLines: [
      `🧪 TDD: ${input.className}_test.go를 먼저 작성하세요.`,
      input.isNewFile
        ? "새 파일을 작성하기 전에 테스트를 먼저 작성하세요."
        : "기존 production behavior 파일을 수정하기 전에 관련 테스트를 먼저 작성하거나 갱신하세요.",
      `예상 테스트 경로: ${input.testPath}`,
      ...TDD_TEST_FIRST_INSTRUCTIONS,
    ],
  };
}

export function expectedProductionGoTestPath(filePath: string, gitRoot: string): string {
  const normalized = repoRelativePath(filePath, gitRoot);
  return path.join(gitRoot, normalized.replace(/\.go$/, "_test.go"));
}

export function productionGoFileKey(filePath: string, gitRoot: string): string {
  return repoRelativePath(filePath, gitRoot);
}

export function isProductionGoTestPath(filePath: string, gitRoot: string): boolean {
  return repoRelativePath(filePath, gitRoot).endsWith("_test.go");
}

export function productionGoFileKeyFromTestPath(filePath: string, gitRoot: string): string | null {
  const normalized = repoRelativePath(filePath, gitRoot);
  if (!normalized.endsWith("_test.go")) return null;
  return normalized.replace(/_test\.go$/, ".go");
}

export function hasProductionGoTestCoverage(filePath: string, gitRoot: string): boolean {
  const testPath = expectedProductionGoTestPath(filePath, gitRoot);
  return fs.existsSync(testPath);
}

function repoRelativePath(filePath: string, gitRoot: string): string {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(gitRoot, filePath);
  return path.relative(gitRoot, absolutePath).replace(/\\/g, "/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
