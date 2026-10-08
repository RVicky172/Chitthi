Review the change for feature **{{feature}} — {{title}}** (`specs/features/{{folder}}/`), task **{{tasks}}**.

{{taskList}}

Files the task names: {{scope}}

The change is `git diff HEAD` plus the untracked files (`git status --porcelain -uall`). The loop started this task
from a clean tree, so that is exactly this task's change and nothing else. The gates have already passed; their run
is in `.factory/runs/` (newest file for {{tasks}}).

Follow your agent instructions (`.claude/agents/reviewer.md`): change nothing, and answer only with the structured
verdict `{ ok, reasons: [{ rule, file?, line?, why }] }`.
