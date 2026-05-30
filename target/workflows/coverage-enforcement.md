# Coverage Enforcement Setup

## For Team Members

### 1. Install Lefthook

**Windows (via Scoop)**:
```bash
scoop install lefthook
```

**macOS**:
```bash
brew install lefthook
```

**Linux**:
```bash
curl -1sLf 'https://dl.cloudsmith.io/public/evilmartians/lefthook/setup.deb.sh' | sudo -E bash
sudo apt install lefthook
```

### 2. Initialize hooks

```bash
cd /path/to/DevCenter
lefthook install
```

### 3. Test

```bash
# Should trigger coverage check
git commit -m "test"
```

## For Claude Code Users

Coverage hooks run automatically via `.claude/hooks/guard-coverage.sh`.
No additional setup needed.

---

## How It Works

### Coverage Enforcement Flow

```
1. Edit/Write .java file
   ↓
2. git add <file>
   ↓
3. git commit
   ↓
4. guard-coverage.sh triggers (Claude Code) OR Lefthook pre-commit (local)
   ↓
5. Extract changed modules
   ↓
6. For each module:
   - Run tests (./gradlew test)
   - Generate JaCoCo report (jacocoTestReport)
   - Verify coverage (jacocoTestCoverageVerification)
   ↓
7. If coverage < threshold → BLOCK with report link
   If coverage >= threshold → ALLOW commit
```

### Module Thresholds

| Module | Threshold | Rationale |
|--------|-----------|-----------|
| api-service | 60% | Most mature module |
| common | 70% | Shared library, high reuse |
| consumer-service | 55% | Kafka integration challenges |

### Progressive Roadmap

- **3개월 후**: +10% (0.70, 0.80, 0.65)
- **6개월 후**: +10% (0.80, 0.90, 0.75)

---

## Troubleshooting

### "Coverage check failed" — What to do?

1. **View the report**:
   ```bash
   # Open HTML report
   open build/reports/jacoco/test/html/index.html
   ```

2. **Identify uncovered lines**:
   - Red = Not covered
   - Yellow = Partially covered (branch)
   - Green = Fully covered

3. **Add tests**:
   - Focus on changed classes only
   - Aim for line coverage >= threshold

4. **Re-run verification**:
   ```bash
   ./gradlew :module:test jacocoTestCoverageVerification
   ```

5. **Commit again**:
   ```bash
   git add <test-file>
   git commit -m "feat: add tests for coverage"
   ```

### "Lefthook not running" — Check installation

```bash
# Verify Lefthook is installed
lefthook version

# Reinstall hooks
lefthook install

# Debug mode
LEFTHOOK_VERBOSE=1 git commit -m "test"
```

### "Legacy code blocking me" — You're covered

**Coverage enforcement only applies to changed files.**

If you don't modify `LegacyService.java`, its low coverage won't block your commit.

Only new/modified code needs to meet the threshold.

---

## Bypass (Emergency Only)

**NOT RECOMMENDED** — Use only for emergency hotfixes.

### Claude Code (guard-coverage.sh)

```bash
# Temporarily disable coverage check
export COVERAGE_SKIP=1

# Commit
git commit -m "hotfix: critical bug"

# Re-enable
unset COVERAGE_SKIP
```

### Lefthook

```bash
# Skip all pre-commit hooks
git commit --no-verify -m "hotfix: critical bug"
```

**After emergency**: Add tests and create follow-up commit.

---

## FAQ

**Q: Does this slow down commits?**

A: First commit after changes: ~10-30s (runs tests). Subsequent commits with no code changes: <1s.

**Q: What if tests are slow?**

A: Coverage check runs only when .java files change. Optimize slow tests separately.

**Q: Can I override the threshold for a specific class?**

A: Yes, add to build.gradle `excludes` list:
```gradle
excludes = [
    '**/generated/**',
    '**/YourClass.java'  // Add here
]
```

**Q: What about integration tests?**

A: JaCoCo reports coverage from all tests (unit + integration). Both count toward the threshold.
