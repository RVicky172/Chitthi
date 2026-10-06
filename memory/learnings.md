# Learnings & Gotchas

Non-obvious facts discovered while building. Keep entries short; group by topic (`## <Topic>`). Add one when
something cost more than ~10 minutes or the fix was non-obvious. Delete entries that become wrong.

## Docs

- On this Windows checkout the Markdown in the working tree is CRLF (`core.autocrlf`; no `.gitattributes` rule for
  `.md`). A Python or sed edit that inserts LF-only lines leaves mixed endings; use the Edit tool, or write CRLF
  explicitly, and compare the count of CR-terminated lines with `wc -l`.
