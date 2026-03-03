# Temporary File Storage

## Rules

AI agents and automation scripts MUST follow these rules when creating temporary files:

### Preferred Storage Locations

1. **`.sisyphus/`** (project root) - Git-ignored directory for reviewable temporary files within the project
2. **`/tmp/`** - System temporary directory for ephemeral data
3. **Agent session directories** - Temporary storage managed by the agent runtime (location determined by agent implementation)

### Forbidden Locations

- **Any non-ignored project directory** - Pollutes version control and creates clutter in `git status`
- **Project root without proper `.gitignore` entry** - Must not appear in version control

### Examples

```bash
# ✅ CORRECT
.sisyphus/work-plan.txt
/tmp/related-docs-targets.txt
<agent-determined-session-dir>/analysis.json

# ❌ WRONG
temp-file.txt
docs/temp-notes.md
```

### Rationale

- Temporary files must not appear in `git status` or interfere with version control
- `.sisyphus/` provides a consistent, reviewable location for project-related temporary files
- System and agent-managed temp directories handle ephemeral data automatically
