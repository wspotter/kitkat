#!/usr/bin/env python3
"""Fix uppercase KIT module references to lowercase `kit` in .py files.

This script updates:
 - `from KIT...` -> `from kit...`
 - `import KIT...` -> `import kit...`
 - bare occurrences of `KIT.` -> `kit.` when not inside string literals on the same line

It works on files under `src/` and `tests/`. Run with `--check` to only show proposed changes, or `--apply` to modify files.
"""

import argparse
import os
import re
from pathlib import Path

PY_EXT = ".py"

IMPORT_FROM_RE = re.compile(r"^(?P<prefix>\s*from\s+)KIT(?P<rest>\b.*)$")
IMPORT_RE = re.compile(r"^(?P<prefix>\s*import\s+)KIT(?P<rest>\b.*)$")
# match KIT. where KIT is a standalone identifier (word boundary)
KIT_DOT_RE = re.compile(r"\bKIT\.")

ROOT = Path(__file__).resolve().parents[1]


def file_should_be_processed(path: Path) -> bool:
    # limit to repo python files under src/ or tests/
    parts = path.parts
    return ("src" in parts or "tests" in parts) and path.suffix == PY_EXT


def line_has_unbalanced_quotes(line: str) -> bool:
    # simple heuristic: if the number of single or double quotes is odd, skip
    return (line.count("'") % 2 == 1) or (line.count('"') % 2 == 1)


def process_file(path: Path) -> tuple[bool, str]:
    changed = False
    new_lines = []
    with open(path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    for line in lines:
        orig = line
        # prefer anchoring import replacements to start of line
        m = IMPORT_FROM_RE.match(line)
        if m:
            line = f"{m.group('prefix')}kit{m.group('rest')}\n"
        else:
            m2 = IMPORT_RE.match(line)
            if m2:
                line = f"{m2.group('prefix')}kit{m2.group('rest')}\n"
            else:
                if "KIT." in line and not line_has_unbalanced_quotes(line):
                    line = KIT_DOT_RE.sub("kit.", line)

        if line != orig:
            changed = True
        new_lines.append(line)

    if changed:
        new_text = "".join(new_lines)
        return True, new_text
    return False, ""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Show changes but don't write files")
    parser.add_argument("--apply", action="store_true", help="Apply changes in-place")
    args = parser.parse_args()

    py_files = [p for p in ROOT.rglob("*.py") if file_should_be_processed(p)]
    if not py_files:
        print("No python files found under src/ or tests/ to process.")
        return

    changed_files = []
    for p in py_files:
        did_change, new_text = process_file(p)
        if did_change:
            changed_files.append((p, new_text))

    if not changed_files:
        print("No matches found — nothing to change.")
        return

    for p, new_text in changed_files:
        print(f"Would change: {p}")
        if args.apply:
            # backup original
            bak = p.with_suffix(p.suffix + ".bak")
            if not bak.exists():
                p.rename(bak)
                bak.write_text(new_text, encoding="utf-8")
                # move bak back to original path name
                bak.rename(p)
            else:
                # overwrite directly
                p.write_text(new_text, encoding="utf-8")
            print(f"Applied change: {p}")

    print(f"Total files changed: {len(changed_files)}")


if __name__ == "__main__":
    main()
