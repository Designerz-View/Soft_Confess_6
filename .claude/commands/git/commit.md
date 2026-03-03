---
name: /git:commit
description: Create atomic, Jira-linked commits for specified subprojects using git-master.
---

# /git:commit Command

## Usage

`/git:commit [paths...]`

**Examples:**

- `/git:commit finance` -> Commits changes in `finance/` directory
- `/git:commit ./` -> Commits changes in the root directory
- `/git:commit front finance` -> Commits changes in `front/` and `finance/` directories sequentially

## Execution Instructions

You are the Release Orchestrator. Follow these steps precisely to create quality, traceable commits.

### 1. Parse & Validate

1. **Identify Targets**: Parse the list of subprojects/paths from the command arguments.
  - If the argument is `./`, target the **root** directory.
  - If the argument is a subproject name (e.g., `finance`), target that **subdirectory**.
  - **Validation**: Ensure each target directory exists. If a directory is missing, abort and inform the user.

2. **Extract Jira Context**:
  - Run `git rev-parse --abbrev-ref HEAD` to get the current branch name.
  - **Pattern Match**: Extract the Jira Ticket ID (e.g., `FIN-123`, `PROJ-999`) from the branch name (regex:
    `[A-Z]+-\d+`).
  - **Fallback**: If no ID is found, ask the user to provide one or confirm proceeding without it.

### 2. Execute Commit Strategy

**CRITICAL**: Since this is a monorepo, you must process each target **SEQUENTIALLY** to avoid git lock contention.

For each target directory:

1. **Contextualize**:
  - Determine the full path for the target.
  - Construct the Commit Prefix: `[TICKET_ID] - ` (e.g., `FIN-123 - `).

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
    Header: {TICKET_ID} - type(scope): description
    
    Example:
    FIN-123 - feat(finance): add payment validation logic
    
    REQUIREMENTS:
    - Use the EXACT prefix: "{TICKET_ID} - "
    - Use Conventional Commits types: feat, fix, docs, style, refactor, test, chore.
    - Description must be perfect, concise, and descriptive.
    - DO NOT commit secrets.
    - DO NOT push to remote.
    ```

### 3. Final Report

After all directories are processed:

- List the commits created (hashes and messages).
- Confirm that the operation is complete.
- Propose USER to push the commits to the remote repository if desired.
