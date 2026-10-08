/*
 * What the factory's headless agents may run without asking (D-014, 402 plan §5 "Permissions"). In `claude -p`
 * nobody answers a permission prompt, so every shell command outside this list is refused and shows up in the
 * result's `permission_denials`. The guardrail hooks (.claude/hooks/) still check every call on top of this.
 */

export const SHELLS = ['Bash', 'PowerShell'];

/** The implementer: tests, gates, read-only git and the repo's own scripts. */
export const IMPLEMENTER_COMMANDS = ['npm run:*', 'npm test:*', 'npx vitest:*', 'npx playwright test:*', 'git status:*', 'git diff:*', 'git log:*', 'git show:*', 'node scripts/:*'];

/** The reviewer reads and may re-run the fast checks; it changes nothing. */
export const REVIEWER_COMMANDS = ['git status:*', 'git diff:*', 'git log:*', 'git show:*', 'npx vitest:*', 'npm run check:*'];

const ROLES = { implementer: IMPLEMENTER_COMMANDS, reviewer: REVIEWER_COMMANDS };

/** `Bash(npm run:*)`, `PowerShell(npm run:*)`, … for a role. */
export function allowedTools(role) {
  const commands = ROLES[role];
  if (!commands) throw new Error(`permissions: unknown role ${JSON.stringify(role)}`);
  return SHELLS.flatMap((shell) => commands.map((c) => `${shell}(${c})`));
}

/** The `claude` arguments for a role: one `--allowedTools` value, comma-separated (no rule contains a comma). */
export const allowedToolsArgs = (role) => ['--allowedTools', allowedTools(role).join(',')];
