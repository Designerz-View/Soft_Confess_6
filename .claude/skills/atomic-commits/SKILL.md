---
name: git-commit
description: Create atomic, Jira-linked commits for specified subprojects using git-master.
license: MIT
compatibility: Requires git-master skill.
metadata:
  author: Vitautas Brazas
  version: "1.0"
---

# Git Commit Skill

Create atomic, Jira-linked commits for specified subprojects, supporting both standard and OpenSpec agentic flows.

**Input**: `paths` (list of strings). The directories to commit changes for.
- `.` or `./` targets the root directory.
- `finance`, `front`, etc. targets subdirectories.
- If no input is provided, default to `./`.

**Steps**

1. **Context & Branch Management**

   - **Detect Current Branch**:
     - Run `git rev-parse --abbrev-ref HEAD`.
   
   - **Infer Jira Context**:
     - **Strategy 1 (Branch Name)**: Check if branch matches `[A-Z]+-\d+`.
       - If YES: Extract ID (e.g., `FIN-762` from `FIN-762-feature`).
     - **Strategy 2 (OpenSpec Context)**: If branch has NO ID, check for OpenSpec change folder.
       - Look for `openspec/changes/<slug>`.
       - Normalize slug to ID (e.g., `fin-762` -> `FIN-762`).
       - If found: 
         - **Switch Branch**: Create/switch to `ID-<full-change-slug>` from `master` (NO PULL).
         - Example: `git checkout -b FIN-762-doublebooking-refund-availability master`.
     - **Strategy 3 (Fallback)**: Prompt user for Ticket ID.

   - **Resolve OpenSpec Task ID**:
     - Check agent context for explicit Task ID (e.g., `2.1`).
     - If present, format suffix: ` - [2.1]`.
     - If absent, suffix is empty string.

2. **Execute Commit Strategy**

   **CRITICAL**: Process each target **SEQUENTIALLY** to avoid git lock contention.

   For each target directory:

   1. **Contextualize**:
      - Determine the full path for the target.
      - Construct the Commit Prefix.
        - Standard: `{TICKET_ID} - `
        - OpenSpec: `{TICKET_ID} - [{TASK_ID}] ` (if Task ID exists)

   2. **Delegate to Git Master**:
      Use `delegate_task` to perform the actual commit work.

      - **Category**: `quick` (or `unspecified-high` if many changes)
      - **Skills**: `['git-master']`
      - **Work Directory**: Use the target directory path.
      - **Prompt**:
        ```text
        You are the Git Master. Create ATOMIC commits for changes in this specific directory: {TARGET_DIR}.

        MISSION:
        1. Analyze `git status` and `git diff` relative to this directory.
        2. Group changes into logical, atomic units (e.g., separate docs, refactors, and features).
        3. Create one or more commits as needed.

        COMMIT MESSAGE FORMAT (Strict Rule):
        Header: {PREFIX}type(scope): description

        Examples:
        - Standard: FIN-123 - feat(finance): add payment validation logic
        - OpenSpec: FIN-762 - [2.1] feat(finance): implement refund check

        REQUIREMENTS:
        - Use the EXACT prefix provided: "{PREFIX}"
        - Use Conventional Commits types: feat, fix, docs, style, refactor, test, chore.
        - Description must be perfect, concise, and descriptive.
        - DO NOT commit secrets.
        - DO NOT push to remote.
        ```

3. **Final Report**

   After all directories are processed:
   - List the commits created (hashes and messages).
   - Confirm that the operation is complete.
   - Propose USER to push the commits to the remote repository if desired.
