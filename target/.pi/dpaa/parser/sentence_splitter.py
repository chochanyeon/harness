from __future__ import annotations
import re

_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z])")


def split_sentences(text: str, line_map: list[int]) -> list[tuple[int, str]]:
    """Returns list of (line_number, sentence) tuples.

    line_map holds the absolute one-indexed source line number for each line
    in text.splitlines(), so the returned line_number matches the original
    document instead of counting lines relative to text.
    """
    results: list[tuple[int, str]] = []
    for index, line in enumerate(text.splitlines()):
        stripped = line.strip()
        if not stripped:
            continue
        line_no = line_map[index]
        sentences = _SENTENCE_RE.split(stripped)
        for s in sentences:
            if s.strip():
                results.append((line_no, s.strip()))
    return results
