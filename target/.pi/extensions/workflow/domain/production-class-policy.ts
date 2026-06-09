import * as path from "node:path";

/**
 * Returns true for Java production classes that should be covered by the TDD gate.
 * DTO/entity/repository/config-style artifacts are intentionally excluded because
 * they are usually exercised through service/controller tests rather than direct
 * test-first class creation.
 */
export function isProductionClassPath(filePath: string, _gitRoot: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  if (!/\/src\/main\/java\/.+\.java$/.test(normalized)) return false;
  if (/\/dto\/|\/entity\/|\/model\/|\/repository\//.test(normalized)) return false;
  const className = path.basename(filePath, ".java");
  if (/^Q[A-Z]|^Migration/.test(className)) return false;
  const EXCLUDE = /(Entity|Dto|VO|Vo|Request|Response|Payload|Config|Configuration|Application|Properties|Settings|Exception|Error|Enum|Record|Constants|Constant|Event|Message|Projection|Form)$/i;
  return !EXCLUDE.test(className);
}
