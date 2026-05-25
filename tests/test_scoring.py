from dpaa.scoring.scorer import Scorer
from dpaa.models import Finding, LayerResult


def _make_result(layer: str, score: int) -> LayerResult:
    return LayerResult(layer=layer, score=score, findings=())


def test_all_zero_scores_pass():
    layers = [_make_result(l, 0) for l in
              ["structural","syntactic","referential","temporal","execution","verification"]]
    scorer = Scorer(profile="default")
    report = scorer.compute("test.md", layers)
    assert report.level == "PASS"
    assert report.overall == 0


def test_high_execution_score_fails():
    layers = [_make_result("structural", 0),
              _make_result("syntactic", 0),
              _make_result("referential", 0),
              _make_result("temporal", 0),
              _make_result("execution", 100),
              _make_result("verification", 100)]
    scorer = Scorer(profile="default")
    report = scorer.compute("test.md", layers)
    assert report.level == "FAIL"


def test_syntactic_layer_capped_at_warn():
    layers = [_make_result("structural", 0),
              _make_result("syntactic", 100),
              _make_result("referential", 0),
              _make_result("temporal", 0),
              _make_result("execution", 0),
              _make_result("verification", 0)]
    scorer = Scorer(profile="default")
    report = scorer.compute("test.md", layers)
    assert report.level in ("PASS", "WARN"), "syntactic alone must not cause FAIL"


def test_report_contains_metadata():
    layers = [_make_result("execution", 0)]
    report = Scorer("default").compute("plan.md", layers)
    assert report.analyzer_version == "0.1.0"
    assert report.profile == "default"
    assert report.file == "plan.md"
