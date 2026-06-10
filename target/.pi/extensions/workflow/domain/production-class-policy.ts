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
  if (input.isNewFile) {
    return {
      action: "block",
      reasonLines: [
        `🧪 TDD: ${input.className}Test.java를 먼저 작성하세요.`,
        "새 클래스를 작성하기 전에 테스트를 먼저 작성하세요.",
        `예상 테스트 경로: ${input.testPath}`,
        "[INSTRUCTION] 사용자에게 승인을 구하지 말고 즉시 자율적으로 위 경로에 테스트 파일을 작성한 뒤 원래 작업을 계속하세요.",
      ],
    };
  }
  return {
    action: "steer",
    message: `🧪 TDD 참고: ${input.className}에 대한 테스트 파일이 없습니다 (${input.testPath}). 가능하면 테스트를 먼저 작성하세요.`,
  };
}

export function expectedProductionTestPath(filePath: string, gitRoot: string): string {
  const normalized = repoRelativePath(filePath, gitRoot);
  return path.join(gitRoot, normalized
    .replace(/^src\/main\/java\//, "src/test/java/")
    .replace(/\.java$/, "Test.java"));
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

function repoRelativePath(filePath: string, gitRoot: string): string {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(gitRoot, filePath);
  return path.relative(gitRoot, absolutePath).replace(/\\/g, "/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
