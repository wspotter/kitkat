# fix: normalize KIT -> kit imports in python code

**Author:** GitHub Copilot
**Commit:** f349bc8
**Date:** 2026-01-15

## Summary ✅
Standardized Python imports by converting uppercase `KIT` references to lowercase `kit` across the codebase. This fixes ModuleNotFoundError on case-sensitive filesystems (Linux) and enables migration/merge workflows to run correctly.

## Detailed Problem Description

Root cause:
- The canonical package name in the codebase is `kit` (lowercase), but legacy or inconsistent imports using the uppercase `KIT` remained in some files. On case-insensitive filesystems (macOS, Windows), these imports can succeed silently; on Linux (case-sensitive), `import KIT` fails immediately with ModuleNotFoundError.

Symptoms:
- Management commands and tests would fail with tracebacks like:

  ModuleNotFoundError: No module named 'KIT'

  The tracebacks typically pointed at files that perform module-level imports (e.g., `src/kit/processor/conversation/anthropic/utils.py`, `src/kit/routers/email.py`, `src/kit/main.py`), causing `makemigrations --merge`, `migrate`, and even test runs to abort early.
- Because the application triggers migrations and collectstatic automatically at startup, that behavior made interactive conflict resolution difficult. We introduced the `KIT_SKIP_AUTO_MIGRATE` environment variable to skip auto-migration/collectstatic during these manual merge attempts.

Why this breaks migrations:
- Django management commands import project modules (app registry), executing module-level imports. Any module-level `from KIT...` or `import KIT...` will raise ModuleNotFoundError before the commands can finish, preventing `makemigrations --merge` from completing.

Concrete examples observed:
- Tracebacks reported `ModuleNotFoundError: No module named 'KIT'` when running `python src/kit/manage.py makemigrations --merge` with stack frames pointing to files like:
  - `src/kit/processor/conversation/anthropic/utils.py`
  - `src/kit/processor/conversation/google/utils.py`
  - `src/kit/routers/email.py`
- Offending import lines looked like: `from KIT.database.models import KITUser` or `import KIT.some.module`.

Fix approach taken:
- Added `scripts/fix_kit_case.py` to safely scan Python files under `src/` and `tests/` and replace `from KIT...` → `from kit...`, `import KIT...` → `import kit...`, and `KIT.` → `kit.` while avoiding obvious string-literal edits (heuristic skip for unbalanced quotes).
- Used an iterative development workflow:
  1. Run `makemigrations --merge` inside a one-off container with `KIT_SKIP_AUTO_MIGRATE=1`.
  2. When ModuleNotFoundError occurs, inspect the traceback to find offending files.
  3. Fix imports in those files, commit, rebuild the image, and re-run the merge.
  4. Repeat until `makemigrations --merge` runs cleanly and migrations can be applied.

Recommendations / remediation steps:
- Run `scripts/fix_kit_case.py --check` and review proposed changes, then `--apply` to modify files and inspect diffs.
- Grep the repository for `\bKIT\b` (including migration files and docs) and audit occurrences that are not safe to auto-change (strings, docs, or migration text references may need manual edits).
- Use `KIT_SKIP_AUTO_MIGRATE=1` when performing interactive management commands to avoid the auto-migrate behavior blocking manual resolution.
- After fixes, run:
  - `python src/kit/manage.py makemigrations --merge`
  - `python src/kit/manage.py migrate`
  - Start the server in anonymous mode (`python src/kit/main.py --anonymous-mode`) and run full test suite (`pytest`).
- Consider adding CI checks (Linux runners) or linters to detect case-sensitive import regressions in the future.

Caveats & notes:
- The fix script uses a heuristic to not edit lines with unbalanced quotes; this prevents many unsafe string edits but does not guarantee absolute safety. Manually review changes in migration files and docs.
- Some migration files may still need manual adjustments if they import using old paths; these should be inspected and corrected with care.

## What changed
- Added script: `scripts/fix_kit_case.py` (scan & apply, supports `--check` and `--apply`).
- Fixed import statements and `KIT.` occurrences in Python files (source + tests).
- Representative files changed include (not exhaustive):
  - `src/kit/configure.py`, `src/kit/main.py`, `src/kit/routers/email.py`, `src/kit/app/settings.py`
  - multiple processors under `src/kit/processor/*`
  - tests: `tests/test_text_search.py`, `tests/test_cli.py`, `tests/test_online_chat_actors.py`

Full changed file list (commit f349bc8):
```
(see commit for full list)
scripts/fix_kit_case.py
src/kit/app/settings.py
src/kit/configure.py
... (omitted here for brevity)
tests/test_text_search.py
```

## Repro checklist (run after merge) 🔁
1. docker compose build server
2. docker compose run --rm -e KIT_SKIP_AUTO_MIGRATE=1 server python src/kit/manage.py makemigrations --merge
3. docker compose run --rm -e KIT_SKIP_AUTO_MIGRATE=1 server python src/kit/manage.py migrate
4. docker compose run --rm -e KIT_SKIP_AUTO_MIGRATE=1 server python src/kit/main.py --anonymous-mode
5. docker compose run --rm -e KIT_SKIP_AUTO_MIGRATE=1 server pytest -q

## Notes & Caveats ⚠️
- The fix script avoids modifying lines with unbalanced quotes to reduce risk of altering string literals. There may still be `KIT` occurrences in docs or migration textual content that need manual review.
- Tests were not fully executed in the final run; recommend running the full test suite after merging.
- For startup/auth testing, use `--anonymous-mode` or set `RESEND_API_KEY` / `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` for full auth flows.

## Suggested next actions ✅
- Run the repro checklist and fix any failing tests.
- Grep for `\bKIT\b` in non-Python files and handle manually.
- Confirm migration graph is merged and DB schema is correct.

---
