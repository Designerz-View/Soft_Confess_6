# Tool Priority Guidelines

## LSP > CLI (When Available)

When Language Server Protocols (LSP) are available for a file type, prefer LSP tools over CLI equivalents. LSP provides semantic understanding (types, scopes, references) that raw text tools lack.

### Priority Table

| Task                     | Preferred Tool (Semantic)            | Avoid (Text-based/Naive)       | Why?                                                             |
|--------------------------|--------------------------------------|--------------------------------|------------------------------------------------------------------|
| **Syntax/Type Checking** | `lsp_diagnostics`                    | `bash -n`, `tsc`, `php -l`     | Checks types, unused vars, and semantic errors, not just syntax. |
| **Go to Definition**     | `lsp_goto_definition`                | `grep "function X"`, `explore` | Jumps to *exact* definition, handling overloads and scopes.      |
| **Find Usages**          | `lsp_find_references`                | `grep "symbolName"`            | Finds actual references, ignoring comments and shadowing.        |
| **Rename Symbol**        | `lsp_rename`                         | `edit` (search/replace)        | Safely renames across files without breaking other code.         |
| **Verify Changes**       | `lsp_diagnostics` (on changed files) | `git diff` alone               | catches regressions immediately after editing.                   |

### When to Fall Back to CLI/Grep

Use CLI/Grep tools only when:
1. LSP server is not installed for the language (e.g. Dockerfiles, Makefiles).
2. Searching for text patterns (comments, string literals).
3. Searching across files where semantic understanding isn't needed.
4. LSP tools return empty results or timeout.

### Verification Standard

**Before marking a task complete**, you must run `lsp_diagnostics` on all files you modified.
- **Clean output** = Verified ✅
- **Errors found** = Fix required ❌

DO NOT use `grep` or `cat` to verify syntax if LSP is available.
