These projects intentionally contain one failure each. `cases.json` is the
machine-readable matrix used by fake-Godot tests; no Godot installation is
required. The test- and export-failure cases select the corresponding fake
executable behavior, while the missing-resource and script-parse-error cases
fail during project validation or script checking.
