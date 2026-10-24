"""Offline end-to-end coverage of the existing installer entry points."""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")
GIT = shutil.which("git")
BASH = shutil.which("bash")
POWERSHELL = shutil.which("powershell") or shutil.which("pwsh")
RUNNERS = ["python", "shell", "powershell", "cmd"]


def environment():
    env = os.environ.copy()
    env.update(GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM="1", GIT_TERMINAL_PROMPT="0", PYTHONIOENCODING="utf-8")
    env.pop("HARNESS_DEST", None)
    env.pop("BASH_ENV", None)
    return env


@pytest.fixture(scope="module")
def source_repo(tmp_path_factory):
    if not NODE or not GIT:
        pytest.skip("Node and Git are required for the local fixture repository")
    repo = tmp_path_factory.mktemp("devin-component-source")
    manifest = subprocess.run(
        [NODE, "-e", "process.stdout.write(JSON.stringify(require(process.argv[1]).bundleFiles))", str(ROOT / ".devin/tools/install.cjs")],
        check=True, capture_output=True, text=True, encoding="utf-8", timeout=15,
    )
    for relative in json.loads(manifest.stdout) + [f"scripts/init-target-harness.{ext}" for ext in ["py", "sh", "ps1", "cmd"]]:
        output = repo / relative
        output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / relative, output)
    # Minimal legacy template: exercising `all` never starts Docker or a server.
    for relative in ["AGENTS.md", ".pi/extensions/workflow.ts", ".pi/extensions/memory.ts", ".claude/settings.json"]:
        output = repo / "target" / relative
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text("legacy fixture\n", encoding="utf-8")
    commit_fixture(repo)
    return repo


def commit_fixture(repo):
    for args in [["init", "--quiet", "-b", "fixture"], ["add", "."], ["-c", "user.name=Installer Test", "-c", "user.email=installer@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture"]]:
        subprocess.run([GIT, *args], cwd=repo, env=environment(), check=True, capture_output=True, timeout=30)


@pytest.fixture(params=RUNNERS)
def runner(request):
    name = request.param
    if name == "shell" and not BASH:
        pytest.skip("bash is unavailable")
    if name == "powershell" and not POWERSHELL:
        pytest.skip("PowerShell is unavailable")
    if name == "cmd" and (os.name != "nt" or not POWERSHELL):
        pytest.skip("Windows CMD and PowerShell are required")
    return name


def ps_quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def invoke(runner, repo, cwd, *, dest=None, components=("devin",), flags=(), env=None):
    """Shell input is piped exactly like curl | sh; all repositories are local."""
    flag_names = {"dry-run": "DryRun", "force": "Force", "clean": "Clean"}
    input_text = None
    if runner in ("python", "shell"):
        if runner == "python":
            command = [sys.executable, str(repo / "scripts/init-target-harness.py")]
        else:
            command = [BASH, "-s", "--", "--repo", str(repo), "--ref", "fixture"]
            input_text = (repo / "scripts/init-target-harness.sh").read_text(encoding="utf-8")
        if dest is not None:
            command += ["--dest", str(dest)]
        for component in components:
            command += ["--component", component]
        command += [f"--{flag}" for flag in flags]
    elif runner == "powershell":
        script = repo / "scripts/init-target-harness.ps1"
        expression = f"& {ps_quote(script)} -Repo {ps_quote(repo)} -Ref fixture"
        if dest is not None:
            expression += f" -Dest {ps_quote(dest)}"
        if components:
            expression += " -Component @(" + ",".join(ps_quote(c) for c in components) + ")"
        expression += "".join(f" -{flag_names[flag]}" for flag in flags)
        command = [POWERSHELL, "-NoProfile", "-NonInteractive", "-Command", expression]
    else:
        arguments = [str(repo / "scripts/init-target-harness.cmd"), "-Repo", str(repo), "-Ref", "fixture"]
        if dest is not None:
            arguments += ["-Dest", str(dest)]
        if components:
            arguments += ["-Component", ",".join(components)]
        arguments += [f"-{flag_names[flag]}" for flag in flags]
        command = subprocess.list2cmdline([os.environ.get("COMSPEC", "cmd.exe"), "/d", "/s", "/c"]) + ' "' + subprocess.list2cmdline(arguments) + '"'
    return subprocess.run(command, input=input_text, cwd=cwd, env=env or environment(), text=True, encoding="utf-8", errors="replace", capture_output=True, timeout=45)


def project(tmp_path):
    target = tmp_path / "project with spaces 한글"
    target.mkdir()
    (target / "README.md").write_text("keep\n", encoding="utf-8")
    return target


def assert_untouched(target):
    assert sorted(p.name for p in target.iterdir()) == ["README.md"]
    assert (target / "README.md").read_text(encoding="utf-8") == "keep\n"


def without_node(tmp_path):
    env = environment()
    if os.name == "nt":
        extensions = ["", ".exe", ".cmd", ".bat"]
        env["PATH"] = os.pathsep.join(folder for folder in env.get("PATH", "").split(os.pathsep) if not any((Path(folder) / ("node" + ext)).is_file() for ext in extensions))
    else:
        # Node and Git commonly share /usr/bin: retain just the legacy tools.
        tools = tmp_path / "legacy-tools"
        tools.mkdir()
        for name in ["git", "find", "mktemp", "rm", "sort", "mkdir", "cp", "cat", "dirname", "sh"]:
            executable = shutil.which(name)
            if executable:
                (tools / name).symlink_to(executable)
        env["PATH"] = str(tools)
        env["GIT_EXEC_PATH"] = subprocess.check_output([GIT, "--exec-path"], text=True, env=environment()).strip()
    if shutil.which("node", path=env["PATH"]) or not shutil.which("git", path=env["PATH"]):
        pytest.skip("cannot isolate Node while retaining Git")
    return env


def test_existing_command_installs_devin_from_project_cwd(runner, source_repo, tmp_path):
    target = project(tmp_path)
    result = invoke(runner, source_repo, target)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "Devin Local" in result.stdout
    assert (target / ".devin/skills/task-start/SKILL.md").is_file()
    assert (target / "docs/devin/STATE.template.md").is_file()
    assert (target / "README.md").read_text(encoding="utf-8") == "keep\n"
    for relative in [".pi", ".claude", ".harness", ".ai", "AGENTS.md", "package.json", ".devin/task.json", ".devin/state"]:
        assert not (target / relative).exists(), relative


def test_devin_dry_run_does_not_write_project(runner, source_repo, tmp_path):
    target = project(tmp_path)
    result = invoke(runner, source_repo, tmp_path, dest=target, flags=("dry-run",))
    assert result.returncode == 0, result.stdout + result.stderr
    assert "DRY RUN" in result.stdout
    assert_untouched(target)


def test_devin_does_not_create_missing_destination_even_in_dry_run(runner, source_repo, tmp_path):
    target = tmp_path / "missing"
    result = invoke(runner, source_repo, tmp_path, dest=target, flags=("dry-run",))
    assert result.returncode != 0
    assert not target.exists()


def test_devin_propagates_existing_package_error_without_merging(runner, source_repo, tmp_path):
    target = project(tmp_path)
    (target / ".devin").mkdir()
    marker = target / ".devin/user.txt"
    marker.write_text("keep existing package", encoding="utf-8")
    result = invoke(runner, source_repo, tmp_path, dest=target)
    assert result.returncode != 0
    assert "already exists" in result.stdout + result.stderr
    assert marker.read_text(encoding="utf-8") == "keep existing package"
    assert not (target / "docs").exists()


@pytest.mark.parametrize("flag", ["force", "clean"])
def test_devin_rejects_destructive_legacy_options(runner, source_repo, tmp_path, flag):
    target = project(tmp_path)
    (target / ".devin").mkdir()
    marker = target / ".devin/user.txt"
    marker.write_text("keep", encoding="utf-8")
    result = invoke(runner, source_repo, tmp_path, dest=target, flags=(flag,))
    assert result.returncode != 0
    assert marker.read_text(encoding="utf-8") == "keep"
    assert not (target / ".pi").exists()


def test_devin_is_not_silently_combined_with_legacy_components(runner, source_repo, tmp_path):
    target = project(tmp_path)
    result = invoke(runner, source_repo, tmp_path, dest=target, components=("devin", "memory"))
    assert result.returncode != 0
    assert_untouched(target)


def test_devin_requires_node_without_writing_destination(runner, source_repo, tmp_path):
    target = project(tmp_path)
    result = invoke(runner, source_repo, tmp_path, dest=target, env=without_node(tmp_path))
    assert result.returncode != 0
    assert "node" in (result.stdout + result.stderr).lower()
    assert_untouched(target)


def test_default_all_stays_legacy_only_and_does_not_require_node(runner, source_repo, tmp_path):
    target = project(tmp_path)
    result = invoke(runner, source_repo, tmp_path, dest=target, components=(), env=without_node(tmp_path))
    assert result.returncode == 0, result.stdout + result.stderr
    assert (target / ".pi/extensions/workflow.ts").is_file()
    assert (target / ".pi/extensions/memory.ts").is_file()
    assert (target / ".claude/settings.json").is_file()
    assert not (target / ".devin").exists()
    assert not (target / "docs/devin").exists()


def test_selected_repository_without_devin_bundle_does_not_fall_back_to_pi(runner, source_repo, tmp_path):
    broken = tmp_path / "legacy-repository"
    shutil.copytree(source_repo, broken, ignore=shutil.ignore_patterns(".git"))
    (broken / ".devin/tools/install.cjs").unlink()
    commit_fixture(broken)
    target = project(tmp_path)
    result = invoke(runner, broken, tmp_path, dest=target)
    assert result.returncode != 0
    assert "Devin bundle not found" in result.stdout + result.stderr
    assert_untouched(target)


def test_devin_wrappers_preserve_link_checks(runner, source_repo, tmp_path):
    target = project(tmp_path)
    link = tmp_path / "linked project"
    linked = subprocess.run([NODE, "-e", "require('fs').symlinkSync(process.argv[1],process.argv[2],process.platform==='win32'?'junction':'dir')", str(target), str(link)], capture_output=True, timeout=15)
    if linked.returncode:
        pytest.skip("directory links are unavailable")
    result = invoke(runner, source_repo, tmp_path, dest=link)
    assert result.returncode != 0
    assert "symbolic link" in result.stdout + result.stderr
    assert_untouched(target)
