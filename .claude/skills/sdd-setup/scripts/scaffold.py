#!/usr/bin/env python3
"""Copy the SDD templates into a project, filling {{PLACEHOLDERS}}; never overwrite existing files.

Usage:
  scaffold.py --target DIR --values values.json [--dry-run]   # create files
  scaffold.py --target DIR --check                              # list leftover placeholders / FILL markers
"""
import argparse
import json
import re
import sys
from pathlib import Path

ASSETS = Path(__file__).resolve().parent.parent / "assets"
# assets/<src> -> <project>/<dest>
LAYOUT = [
    ("specs", "specs"),
    ("memory", "memory"),
    ("commands", ".claude/commands"),
]
CLAUDE_SECTION = "CLAUDE-section.md"
REQUIRED = ["PROJECT_NAME", "TODAY", "CHECK_CMD", "TEST_CMD"]
PLACEHOLDER = re.compile(r"\{\{([A-Z_]+)\}\}")
CHECKED_DIRS = ["specs", "memory", ".claude/commands"]
CHECKED_FILES = ["CLAUDE.md", "CLAUDE.sdd-section.md"]


def derived(values: dict) -> dict:
    """Values built from others: the Definition-of-Done gate list and the commands table."""
    v = dict(values)
    gates = [f"`{v['CHECK_CMD']}` passes (the fast gate: typecheck, lint, unit tests — whatever the project has)."]
    if v.get("E2E_CMD"):
        gates.append(f"`{v['E2E_CMD']}` passes.")
    if v.get("BUILD_CMD"):
        gates.append(f"`{v['BUILD_CMD']}` succeeds.")
    v["DOD_GATES"] = "\n".join(f"{i + 2}. {g}" for i, g in enumerate(gates))
    n = len(gates) + 2
    v["DOD_DOCS_N"] = str(n)

    rows = [(v["CHECK_CMD"], "fast gate — must pass before any task is ticked"), (v["TEST_CMD"], "unit tests only")]
    if v.get("E2E_CMD"):
        rows.append((v["E2E_CMD"], "end-to-end / integration tests"))
    if v.get("BUILD_CMD"):
        rows.append((v["BUILD_CMD"], "production build"))
    if v.get("FORMAT_CMD"):
        rows.append((v["FORMAT_CMD"], "format"))
    width = max(len(c) for c, _ in rows) + 2
    v["COMMANDS_BLOCK"] = "\n".join(f"{c.ljust(width)}# {d}" for c, d in rows)

    v["GATE_RUN"] = f"`{v['CHECK_CMD']}`" + (f" (and `{v['E2E_CMD']}` if the change affects UI or integration)" if v.get("E2E_CMD") else "")
    v["VERIFY_RUN"] = ", ".join(f"`{c}`" for c in [v["CHECK_CMD"], v.get("E2E_CMD"), v.get("BUILD_CMD")] if c)
    for k in ["E2E_CMD", "BUILD_CMD", "FORMAT_CMD"]:
        v.setdefault(k, "")
    return v


def fill(text: str, values: dict, source: Path) -> str:
    def sub(m):
        key = m.group(1)
        if key not in values:
            print(f"  ! unknown placeholder {{{{{key}}}}} in {source.name}; left as is", file=sys.stderr)
            return m.group(0)
        return values[key]

    return PLACEHOLDER.sub(sub, text)


def scaffold(target: Path, values: dict, dry: bool) -> int:
    missing = [k for k in REQUIRED if not values.get(k)]
    if missing:
        print(f"values.json is missing: {', '.join(missing)}", file=sys.stderr)
        return 2
    values = derived(values)
    created, skipped = [], []
    for src, dest in LAYOUT:
        for f in sorted((ASSETS / src).rglob("*")):
            if f.is_dir():
                continue
            out = target / dest / f.relative_to(ASSETS / src)
            if out.exists():
                skipped.append(out)
                continue
            created.append(out)
            if not dry:
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_text(fill(f.read_text(encoding="utf-8"), values, f), encoding="utf-8")
    features = target / "specs" / "features"
    if not features.exists():
        created.append(features / ".gitkeep")
        if not dry:
            features.mkdir(parents=True, exist_ok=True)
            (features / ".gitkeep").write_text("", encoding="utf-8")

    section = fill((ASSETS / CLAUDE_SECTION).read_text(encoding="utf-8"), values, ASSETS / CLAUDE_SECTION)
    claude = target / "CLAUDE.md"
    if claude.exists():
        claude_out = target / "CLAUDE.sdd-section.md"
        claude_note = f"CLAUDE.md exists: SDD section written to {claude_out.name} - merge it into CLAUDE.md, then delete it"
    else:
        claude_out = claude
        claude_note = "CLAUDE.md created"
    if not dry:
        claude_out.write_text(section, encoding="utf-8")

    rel = lambda p: p.relative_to(target).as_posix()
    print(("DRY RUN - nothing written\n" if dry else "") + f"Created ({len(created)}):")
    for p in created:
        print(f"  + {rel(p)}")
    if skipped:
        print(f"Skipped, already exist ({len(skipped)}) - compare and merge by hand if useful:")
        for p in skipped:
            print(f"  = {rel(p)}")
    print(claude_note)
    print("Next: replace every <!-- FILL: ... --> marker, then run with --check.")
    return 0


def check(target: Path) -> int:
    files = [p for d in CHECKED_DIRS if (target / d).exists() for p in (target / d).rglob("*.md")]
    files += [target / f for f in CHECKED_FILES if (target / f).exists()]
    problems = 0
    for p in sorted(files):
        for n, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
            # Templates for future features legitimately keep NNN/<Feature Name> placeholders; only flag ours.
            if PLACEHOLDER.search(line) or "<!-- FILL" in line:
                problems += 1
                print(f"{p.relative_to(target).as_posix()}:{n}: {line.strip()[:110]}")
    if (target / "CLAUDE.sdd-section.md").exists():
        problems += 1
        print("CLAUDE.sdd-section.md still exists: merge it into CLAUDE.md and delete it")
    print("OK: no leftover placeholders or FILL markers" if problems == 0 else f"{problems} item(s) to fix")
    return 0 if problems == 0 else 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--target", required=True, type=Path)
    ap.add_argument("--values", type=Path)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    target = a.target.resolve()
    if not target.is_dir():
        print(f"not a directory: {target}", file=sys.stderr)
        return 2
    if a.check:
        return check(target)
    if not a.values:
        print("--values is required unless --check", file=sys.stderr)
        return 2
    return scaffold(target, json.loads(a.values.read_text(encoding="utf-8")), a.dry_run)


if __name__ == "__main__":
    sys.exit(main())
