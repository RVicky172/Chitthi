# Gate outputs

Real output of each gate command, captured on 2026-10-08 (402 T020), for the parsers in `gates.mjs`:
`check-pass.txt` (`npm run check`), `licenses-pass.txt`, `mcp-pass.txt` (the documents folder path replaced by
`<Documents>`), `e2e-pass.txt` (`e2e/docs.e2e.ts`) and `e2e-fail-flaky.txt` (a throwaway spec with a passing, a
failing and a flaky test, `--retries=1`). `selftest-pass.txt` keeps the real summary lines of a run;
`selftest-fail.txt` is written in the format `scripts/test.cjs` prints (lines 29–30), since a real failing run needs
a broken check.
