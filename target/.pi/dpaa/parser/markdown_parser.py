from __future__ import annotations
from dataclasses import dataclass, field
from markdown_it import MarkdownIt


@dataclass
class Section:
    title: str
    level: int
    content: str
    line_start: int
    content_line_map: list[int] = field(default_factory=list)


@dataclass
class PlanDocument:
    sections: dict[str, Section] = field(default_factory=dict)
    raw: str = ""


def _trim_blank_boundaries(lines: list[str], line_map: list[int]) -> tuple[list[str], list[int]]:
    """Drop leading/trailing whitespace-only lines from lines and line_map together.

    Keeps content and content_line_map the same length after trimming, so
    line_map[index] always matches text.splitlines()[index] for the returned
    content string.
    """
    start = 0
    end = len(lines)
    while start < end and not lines[start].strip():
        start += 1
    while end > start and not lines[end - 1].strip():
        end -= 1
    return lines[start:end], line_map[start:end]


class MarkdownParser:
    def __init__(self) -> None:
        self._md = MarkdownIt()

    def parse(self, text: str) -> PlanDocument:
        doc = PlanDocument(raw=text)
        tokens = self._md.parse(text)
        lines = text.splitlines()

        if not any(token.type == "heading_open" for token in tokens):
            if text.strip():
                trimmed_lines, trimmed_map = _trim_blank_boundaries(lines, list(range(1, len(lines) + 1)))
                doc.sections["Document"] = Section(
                    title="Document",
                    level=0,
                    content="\n".join(trimmed_lines),
                    line_start=0,
                    content_line_map=trimmed_map,
                )
            return doc

        title_counts: dict[str, int] = {}

        def add_section(title: str, level: int, content: list[str], line_start: int, line_map: list[int]) -> None:
            count = title_counts.get(title, 0) + 1
            title_counts[title] = count
            key = title if count == 1 else f"{title}#{count}"
            trimmed_content, trimmed_map = _trim_blank_boundaries(content, line_map)
            doc.sections[key] = Section(
                title=title,
                level=level,
                content="\n".join(trimmed_content),
                line_start=line_start,
                content_line_map=trimmed_map,
            )

        current_title: str | None = None
        current_level: int = 0
        current_start: int = 0
        content_lines: list[str] = []
        content_line_map: list[int] = []
        awaiting_heading_text = False

        for token in tokens:
            if token.type == "heading_open":
                if current_title:
                    add_section(current_title, current_level, content_lines, current_start, content_line_map)
                current_level = int(token.tag[1])
                current_start = token.map[0] if token.map else 0
                content_lines = []
                content_line_map = []
                current_title = None
                awaiting_heading_text = True
            elif token.type == "inline" and awaiting_heading_text:
                current_title = token.content.strip() or "Untitled"
                awaiting_heading_text = False
            elif token.type not in ("heading_open", "heading_close", "inline") and current_title:
                if token.map:
                    for i in range(token.map[0], token.map[1]):
                        if i < len(lines):
                            content_lines.append(lines[i])
                            content_line_map.append(i + 1)

        if current_title:
            add_section(current_title, current_level, content_lines, current_start, content_line_map)

        return doc
