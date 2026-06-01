import json
import os
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GATE = ROOT / "target" / ".claude" / "hooks" / "workflow-gate.cjs"
TEMPLATE_HARNESS = ROOT / "target" / ".harness"
CLAUDE_SETTINGS = ROOT / "target" / ".claude" / "settings.json"


def run_gate(project: Path, command: str, payload: dict | None = None, extra_env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["node", str(GATE), command],
        input=json.dumps(payload or {}),
        text=True,
        encoding="utf-8",
        capture_output=True,
        cwd=project,
        env={**os.environ, **(extra_env or {}), "CLAUDE_PROJECT_DIR": str(project)},
        check=False,
    )


def seed_project(tmp_path: Path) -> Path:
    project = tmp_path / "project"
    shutil.copytree(TEMPLATE_HARNESS, project / ".harness")
    subprocess.run(["git", "init"], cwd=project, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=project, check=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=project, check=True)
    (project / "README.md").write_text("# test\n", encoding="utf-8")
    subprocess.run(["git", "add", "."], cwd=project, check=True)
    subprocess.run(["git", "commit", "-m", "initial"], cwd=project, check=True, capture_output=True)
    return project


def parse_stdout(result: subprocess.CompletedProcess[str]) -> dict:
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def test_plan_blocks_source_edit(tmp_path: Path):
    project = seed_project(tmp_path)
    result = run_gate(project, "check-tool-call", {"tool_name": "Edit", "tool_input": {"file_path": "src/app.ts"}})
    output = parse_stdout(result)
    decision = output["hookSpecificOutput"]
    assert decision["permissionDecision"] == "deny"
    assert "Current phase: interview" in decision["permissionDecisionReason"]


def test_interview_allows_interview_artifact_edit(tmp_path: Path):
    project = seed_project(tmp_path)
    result = run_gate(project, "check-tool-call", {"tool_name": "Edit", "tool_input": {"file_path": ".ai/interview/spec.md"}})
    assert result.returncode == 0
    assert result.stdout == ""


def test_interview_and_plan_artifacts_auto_advance_to_plan_review(tmp_path: Path):
    project = seed_project(tmp_path)
    (project / ".ai" / "interview").mkdir(parents=True, exist_ok=True)
    (project / ".ai" / "interview" / "spec.md").write_text("# Spec\n", encoding="utf-8")
    (project / ".ai" / "interview" / "plan.md").write_text("# Plan\n", encoding="utf-8")
    result = run_gate(project, "reevaluate", {"tool_name": "Write", "tool_input": {"file_path": ".ai/interview/plan.md"}})
    assert result.returncode == 0
    state = json.loads((project / ".harness" / "state.json").read_text(encoding="utf-8"))
    assert state["state"] == "plan_review"
    assert "interview → plan → plan_review" in result.stdout


def test_protected_path_is_denied(tmp_path: Path):
    project = seed_project(tmp_path)
    result = run_gate(project, "check-tool-call", {"tool_name": "Write", "tool_input": {"file_path": ".claude/settings.json"}})
    output = parse_stdout(result)
    assert output["hookSpecificOutput"]["permissionDecision"] == "deny"
    assert "Protected path" in output["hookSpecificOutput"]["permissionDecisionReason"]


def test_claude_settings_layers_permissions_sandbox_and_hooks():
    settings = json.loads(CLAUDE_SETTINGS.read_text(encoding="utf-8"))
    deny = settings["permissions"]["deny"]
    assert "Edit(.claude/**)" in deny
    assert "Write(.harness/state.json)" in deny
    assert settings["sandbox"]["enabled"] is True
    assert settings["sandbox"]["allowUnsandboxedCommands"] is False
    assert ".harness/state.json" in settings["sandbox"]["filesystem"]["denyWrite"]
    assert ".harness/workflow.json" in settings["sandbox"]["filesystem"]["denyWrite"]
    assert ".harness/.authority-runtime" in settings["sandbox"]["filesystem"]["denyWrite"]
    assert ".harness/.authority-runtime" in settings["sandbox"]["filesystem"]["denyRead"]
    assert ".harness/authority" in settings["sandbox"]["filesystem"]["denyRead"]
    assert "PreToolUse" in settings["hooks"]
    assert "PostToolUse" in settings["hooks"]
    pre_hook = settings["hooks"]["PreToolUse"][0]["hooks"][0]
    assert pre_hook["command"].endswith("workflow-gate.cjs\" check-tool-call")
    assert "args" not in pre_hook


def test_status_uses_pi_phase_names(tmp_path: Path):
    project = seed_project(tmp_path)
    result = run_gate(project, "status")
    assert result.returncode == 0
    assert "현재 단계: interview" in result.stdout
    assert "다음 단계: plan" in result.stdout


def test_code_review_approval_runs_code_quality_and_auto_advances_to_commit(tmp_path: Path):
    project = seed_project(tmp_path)
    state = json.loads((project / ".harness" / "state.json").read_text(encoding="utf-8"))
    state.update({"state": "code_review", "phase": "code_review"})
    (project / ".harness" / "state.json").write_text(json.dumps(state), encoding="utf-8")
    (project / ".harness" / "authority" / "review-package.json").write_text(
        json.dumps({"status": "approved", "critical": 0, "major": 0, "minor": 0}),
        encoding="utf-8",
    )
    (project / ".harness" / "proposal" / "docs-summary.md").write_text("Docs checked\n", encoding="utf-8")
    result = run_gate(
        project,
        "approve",
        extra_env={"HARNESS_CODE_QUALITY_GUARD_CMD": "python -c \"print('ok')\""},
    )
    assert result.returncode == 0
    assert "code_review → review_approved → document → commit" in result.stdout
    state = json.loads((project / ".harness" / "state.json").read_text(encoding="utf-8"))
    assert state["state"] == "commit"


def test_checkpoint_and_restore_roundtrip(tmp_path: Path):
    project = seed_project(tmp_path)
    readme = project / "README.md"
    readme.write_text("# changed\n", encoding="utf-8")
    result = run_gate(project, "checkpoint")
    assert result.returncode == 0
    assert "Workspace checkpoint created" in result.stdout
    checkpoint = run_gate(project, "checkpoints")
    prefix = checkpoint.stdout.strip().splitlines()[0][:8]
    readme.write_text("# changed again\n", encoding="utf-8")
    restored = subprocess.run(
        ["node", str(GATE), "restore", prefix],
        text=True,
        encoding="utf-8",
        capture_output=True,
        cwd=project,
        env={**os.environ, "CLAUDE_PROJECT_DIR": str(project)},
        check=False,
    )
    assert restored.returncode == 0
    assert "Workspace files restored" in restored.stdout
    assert readme.read_text(encoding="utf-8") == "# changed\n"


def test_workflow_command_files_include_ported_commands():
    commands = {p.stem for p in (ROOT / "target" / ".claude" / "commands" / "workflow").glob("*.md")}
    assert {"checkpoint", "checkpoints", "restore", "dpaa-audit", "approve", "status"}.issubset(commands)


def test_commit_to_push_issues_session_authority_token(tmp_path: Path):
    project = seed_project(tmp_path)
    state = json.loads((project / ".harness" / "state.json").read_text(encoding="utf-8"))
    state.update({"state": "commit", "phase": "commit", "workflowId": "wf-session-test"})
    (project / ".harness" / "state.json").write_text(json.dumps(state), encoding="utf-8")
    result = run_gate(project, "approve", {"session_id": "sess-1"})
    assert result.returncode == 0
    assert "commit → push" in result.stdout
    auth_files = list((project / ".harness" / ".authority-runtime").rglob("*.json"))
    assert auth_files
    auth = json.loads(auth_files[0].read_text(encoding="utf-8"))
    assert auth["tokens"]["push_execution"]["workflow_id"] == "wf-session-test"


def test_user_prompt_injects_guidance_and_natural_approval(tmp_path: Path):
    project = seed_project(tmp_path)
    state = json.loads((project / ".harness" / "state.json").read_text(encoding="utf-8"))
    state.update({"state": "commit", "phase": "commit", "workflowId": "wf-natural"})
    (project / ".harness" / "state.json").write_text(json.dumps(state), encoding="utf-8")
    result = run_gate(project, "user-prompt", {"session_id": "s-natural", "prompt": "응 진행해"})
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert "commit → push" in payload["systemMessage"]
    state = json.loads((project / ".harness" / "state.json").read_text(encoding="utf-8"))
    assert state["state"] == "push"


def test_skip_token_allows_code_quality_once(tmp_path: Path):
    project = seed_project(tmp_path)
    state = json.loads((project / ".harness" / "state.json").read_text(encoding="utf-8"))
    state.update({"state": "code_review", "phase": "code_review", "workflowId": "wf-skip"})
    (project / ".harness" / "state.json").write_text(json.dumps(state), encoding="utf-8")
    (project / ".harness" / "authority" / "review-package.json").write_text(json.dumps({"status": "approved"}), encoding="utf-8")
    skip = run_gate(project, "skip", {"session_id": "s-skip"}, extra_env={})
    assert "Usage: skip" in skip.stdout
    skip = subprocess.run(["node", str(GATE), "skip", "code-quality", "test reason"], text=True, encoding="utf-8", capture_output=True, cwd=project, env={**os.environ, "CLAUDE_PROJECT_DIR": str(project)}, check=False)
    assert skip.returncode == 0
    result = run_gate(project, "approve", {"session_id": "manual"}, extra_env={"HARNESS_CODE_QUALITY_GUARD_CMD": "python -c \"raise SystemExit(1)\""})
    assert result.returncode == 0
    assert "code_review → review_approved" in result.stdout


def test_git_dash_c_push_is_blocked(tmp_path: Path):
    project = seed_project(tmp_path)
    state = json.loads((project / ".harness" / "state.json").read_text(encoding="utf-8"))
    state.update({"state": "push", "phase": "push", "workflowId": "wf-push"})
    (project / ".harness" / "state.json").write_text(json.dumps(state), encoding="utf-8")
    result = run_gate(project, "check-tool-call", {"tool_name": "Bash", "tool_input": {"command": "git -C /tmp push"}})
    assert "git -C" in result.stdout
    quoted = run_gate(project, "check-tool-call", {"tool_name": "Bash", "tool_input": {"command": "git -C \"/tmp/with space\" push"}})
    assert "git -C" in quoted.stdout


def test_submit_review_package_writes_authority_file(tmp_path: Path):
    project = seed_project(tmp_path)
    result = subprocess.run(
        ["node", str(GATE), "submit-review-package", "critical=0", "major=0", "minor=2", "summary=ok"],
        text=True,
        encoding="utf-8",
        capture_output=True,
        cwd=project,
        env={**os.environ, "CLAUDE_PROJECT_DIR": str(project)},
        check=False,
    )
    assert result.returncode == 0
    assert "Review package approved" in result.stdout
    data = json.loads((project / ".harness" / "authority" / "review-package.json").read_text(encoding="utf-8"))
    assert data["status"] == "approved"
    assert data["minor"] == 2


def test_snapshot_creates_ai_interview_run(tmp_path: Path):
    project = seed_project(tmp_path)
    (project / ".ai" / "interview").mkdir(parents=True, exist_ok=True)
    (project / ".ai" / "interview" / "spec.md").write_text("# spec\n", encoding="utf-8")
    result = subprocess.run(
        ["node", str(GATE), "snapshot", "manual"],
        text=True,
        encoding="utf-8",
        capture_output=True,
        cwd=project,
        env={**os.environ, "CLAUDE_PROJECT_DIR": str(project)},
        check=False,
    )
    assert result.returncode == 0
    assert "Artifact snapshot created" in result.stdout
    assert list((project / ".ai" / "interview" / "runs").rglob("spec.md"))


def test_phase_undo_restores_workspace_checkpoint(tmp_path: Path):
    project = seed_project(tmp_path)
    (project / ".ai" / "interview").mkdir(parents=True, exist_ok=True)
    (project / ".ai" / "interview" / "spec.md").write_text("# spec\n", encoding="utf-8")
    readme = project / "README.md"
    readme.write_text("# before transition\n", encoding="utf-8")
    result = run_gate(project, "reevaluate", {"session_id": "undo-session"})
    assert result.returncode == 0
    assert "interview → plan" in result.stdout
    readme.write_text("# after transition\n", encoding="utf-8")
    undo = run_gate(project, "undo")
    assert undo.returncode == 0
    assert "Workflow undo: plan_review → plan" in undo.stdout
    assert readme.read_text(encoding="utf-8") == "# before transition\n"
    state = json.loads((project / ".harness" / "state.json").read_text(encoding="utf-8"))
    assert state["state"] == "plan"


def test_list_includes_workflow_catalog(tmp_path: Path):
    project = seed_project(tmp_path)
    (project / ".pi" / "workflows").mkdir(parents=True, exist_ok=True)
    (project / ".pi" / "workflows" / "bugfix.md").write_text("# Bugfix Workflow\n", encoding="utf-8")
    result = run_gate(project, "list")
    assert result.returncode == 0
    assert "Workflow catalog" in result.stdout
    assert "bugfix: Bugfix Workflow" in result.stdout


def test_start_replaces_installed_template_state(tmp_path: Path):
    project = seed_project(tmp_path)
    result = subprocess.run(
        ["node", str(GATE), "start", "new goal"],
        text=True,
        encoding="utf-8",
        capture_output=True,
        cwd=project,
        env={**os.environ, "CLAUDE_PROJECT_DIR": str(project)},
        check=False,
    )
    assert result.returncode == 0
    assert "new goal" in result.stdout
    state = json.loads((project / ".harness" / "state.json").read_text(encoding="utf-8"))
    assert state["workflowId"].startswith("wf-")


def test_skip_accepts_single_quoted_arguments_like_slash_command(tmp_path: Path):
    project = seed_project(tmp_path)
    result = subprocess.run(
        ["node", str(GATE), "skip", "code-quality test reason"],
        text=True,
        encoding="utf-8",
        capture_output=True,
        cwd=project,
        env={**os.environ, "CLAUDE_PROJECT_DIR": str(project)},
        check=False,
    )
    assert result.returncode == 0
    assert "skip token issued" in result.stdout


def test_redo_persists_after_separate_cli_invocation(tmp_path: Path):
    project = seed_project(tmp_path)
    (project / ".ai" / "interview").mkdir(parents=True, exist_ok=True)
    (project / ".ai" / "interview" / "spec.md").write_text("# spec\n", encoding="utf-8")
    assert run_gate(project, "reevaluate", {"session_id": "redo-session"}).returncode == 0
    undo = run_gate(project, "undo")
    assert undo.returncode == 0
    redo = run_gate(project, "redo")
    assert redo.returncode == 0
    assert "Workflow redo" in redo.stdout


def test_git_push_validates_workspace_without_reference_error(tmp_path: Path):
    import hashlib

    project = seed_project(tmp_path)
    workflow_id = "wf-push-ok"
    branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=project, text=True, encoding="utf-8").strip()
    state = json.loads((project / ".harness" / "state.json").read_text(encoding="utf-8"))
    state.update({"state": "push", "phase": "push", "workflowId": workflow_id, "gitRoot": str(project), "branch": branch})
    (project / ".harness" / "state.json").write_text(json.dumps(state), encoding="utf-8")
    project_hash = hashlib.sha256(str(project.resolve()).encode()).hexdigest()[:16]
    auth_dir = project / ".harness" / ".authority-runtime" / project_hash
    auth_dir.mkdir(parents=True, exist_ok=True)
    (auth_dir / "sess.json").write_text(json.dumps({"tokens": {"code_review": {"workflow_id": workflow_id}, "push_execution": {"workflow_id": workflow_id}}}), encoding="utf-8")
    result = run_gate(project, "check-tool-call", {"session_id": "sess", "tool_name": "Bash", "tool_input": {"command": "git push origin HEAD"}})
    assert result.returncode == 0
    assert "validateWorkflowWorkspace" not in result.stdout
    assert "permissionDecision" not in result.stdout


def test_runtime_state_changes_do_not_count_as_implementation_evidence(tmp_path: Path):
    project = seed_project(tmp_path)
    state = json.loads((project / ".harness" / "state.json").read_text(encoding="utf-8"))
    state.update({"state": "implement", "phase": "implement", "workflowId": "wf-runtime-only"})
    (project / ".harness" / "state.json").write_text(json.dumps(state), encoding="utf-8")
    result = run_gate(project, "reevaluate", {"session_id": "runtime-only"})
    assert result.returncode == 0
    assert result.stdout.strip() == ""
    state = json.loads((project / ".harness" / "state.json").read_text(encoding="utf-8"))
    assert state["state"] == "implement"


def test_untracked_source_file_counts_as_implementation_evidence(tmp_path: Path):
    project = seed_project(tmp_path)
    state = json.loads((project / ".harness" / "state.json").read_text(encoding="utf-8"))
    state.update({"state": "implement", "phase": "implement", "workflowId": "wf-source-evidence"})
    (project / ".harness" / "state.json").write_text(json.dumps(state), encoding="utf-8")
    (project / "src").mkdir()
    (project / "src" / "app.ts").write_text("export const ok = true;\n", encoding="utf-8")
    result = run_gate(project, "reevaluate", {"session_id": "source-evidence"})
    assert result.returncode == 0
    assert "implement → code_review" in result.stdout


def test_authority_changes_do_not_count_as_implementation_evidence(tmp_path: Path):
    project = seed_project(tmp_path)
    state = json.loads((project / ".harness" / "state.json").read_text(encoding="utf-8"))
    state.update({"state": "implement", "phase": "implement", "workflowId": "wf-authority-only"})
    (project / ".harness" / "state.json").write_text(json.dumps(state), encoding="utf-8")
    (project / ".harness" / "authority" / "review-package.json").write_text(json.dumps({"status": "approved"}), encoding="utf-8")
    result = run_gate(project, "reevaluate", {"session_id": "authority-only"})
    assert result.returncode == 0
    assert result.stdout.strip() == ""
    state = json.loads((project / ".harness" / "state.json").read_text(encoding="utf-8"))
    assert state["state"] == "implement"


def test_push_policy_flags_authority_changes_without_matching_signature(tmp_path: Path):
    project = seed_project(tmp_path)
    state = json.loads((project / ".harness" / "state.json").read_text(encoding="utf-8"))
    state.update({"state": "commit", "phase": "commit", "workflowId": "wf-authority-policy"})
    (project / ".harness" / "state.json").write_text(json.dumps(state), encoding="utf-8")
    (project / ".harness" / "authority" / "push-approval.json").write_text(json.dumps({"status": "approved"}), encoding="utf-8")
    result = run_gate(project, "approve", {"session_id": "authority-policy"})
    assert result.returncode == 0
    assert "Push policy scan blocked" in result.stdout
    state = json.loads((project / ".harness" / "state.json").read_text(encoding="utf-8"))
    assert state["state"] == "commit"
