# Atomic Commits Across All Flows

## Requirement

When performing any flow that implements code changes
 (including OpenSpec flows, update flows, and ad‑hoc implementation work),
 agents **MUST** create **atomic commits** and use the **`git-commit` skill** to do so.

### Scope

Applies to **all flows and implementation activities** where code changes are produced.

### Expectations

- Commit changes in **small, task‑scoped increments**.
- Each logical task/step should map to **one atomic commit**.
- Use the **`git-commit` skill** to create commits (do not bypass it).
- Do **not** batch unrelated changes into the same commit.
- If a task is incomplete or blocked, do **not** create a commit for it.

### Exceptions

- If the user explicitly asks **not** to commit or to commit differently, follow the user's instruction.
