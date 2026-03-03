---
name: /generate:prompt
description: Generate concise, complete prompts from poor task descriptions with context gathering and clarification.
category: Workflow
tags: [generate, prompts, clarification]
---

# /generate:prompt Command

Generate several concise yet complete prompt options from a poor or unclear task description by gathering context, researching related files, asking clarifying questions, and storing the results. Each prompt must include examples (success + failure), explicit "What to do" and "What to avoid" sections, and architectural decisions when the task is code-related.

**Input**: The single argument after `/generate:prompt` is the raw task description text.

## Steps

1. **Parse the input argument**
   - Treat the entire argument string as the task description (may include file paths, globs, or examples).
   - If no argument is provided:
     - **Option A (default)**: **MANDATORY** ask the user for a task description to start with, then proceed with the steps using the user-provided input.
     - **Option B (active conversation context)**: If the command is invoked mid-conversation and there is ongoing user-agent dialogue about a task, collect the relevant prior dialogue and generate several prompt versions that capture how-to-implement the discussed work.

2. **Collect related file references from the description**
   - Extract any file paths, relative paths, or schematic references from the input.
   - Identify potential glob patterns (e.g., `docs/**`, `*.md`, `rules/*.md`) mentioned or implied.

3. **Resolve referenced files and content**
   - Use **Glob** to expand any file globs.
   - Use **Read** to load the content of each referenced file.
   - Use **Grep** to find mentions of referenced filenames or keywords across the repo if needed.
   - If a referenced file does not exist, record it as a missing dependency.

4. **Analyze the task and context**
   - Summarize the intended goal of the task in one sentence.
   - Extract explicit requirements, constraints, and examples from the input and related files.
   - Identify gaps: missing info required to craft a good prompt.
   - Identify ambiguities or conflicting requirements.

5. **Ask clarifying questions (if needed)**
   - Use the **AskUserQuestion tool** to ask only the minimum set of questions required to resolve ambiguity.
   - Prefer multiple-choice questions when possible to reduce back-and-forth.
   - Wait for user answers before proceeding.

6. **Research and cross-check (if needed)**
   - If understanding still lacks critical context, perform additional **Grep** and **Read** searches.
   - If external libraries or APIs are involved, perform a **websearch** and cite findings.
   - Validate assumptions with the user if uncertainty remains; wait for answers.

7. **Generate prompt variants using a structured template**
   - Produce **3 to 5** prompt versions.
   - Each version must be concise yet complete.
   - Incorporate all gathered context, constraints, and clarifications.
   - Do not invent paths or requirements; only use verified info or user-provided assumptions.
   - Use a consistent structure with clear sections and indentation. Recommended template:

   ```xml
   <context>
   [Role, project, and key constraints]
   </context>
   
   <task>
   [Concise one-paragraph task summary]
   </task>
   
   <what_to_do>
   - [Actionable requirement 1]
   - [Actionable requirement 2]
   </what_to_do>
   
   <what_to_avoid>
   - [Explicit anti-goal 1]
   - [Explicit anti-goal 2]
   </what_to_avoid>
   
   <architecture_decisions>
   - [Decision + rationale] (only if task is coding/architecture-related)
   </architecture_decisions>
   
   <examples>
     <example type="success">
     Input: [sample input]
     Output: [expected output]
     </example>
   
     <example type="failure">
     Input: [sample input]
     Output: [incorrect output]
     Reason: [why it fails]
     </example>
   </examples>
   
   <output_format>
   [Exact formatting rules, if required]
   </output_format>
   ```

8. **Persist results**
   - Create `.sisyphus/drafts/prompts/` if it does not exist.
   - Save all prompt variants to:
     `.sisyphus/drafts/prompts/<short-task-description>-<timestamp>.md`
   - Use a short, safe summary slug (kebab-case) for `<short-task-description>`.
   - Use a timestamp format: `YYYYMMDD-HHMMSS` (local time).
   - Ensure the file is easy to locate later.

## Output

After completion, respond with a SINGLE markdown document that contains:
- The resolved task summary
- Any Assumptions made
- Any Findings made
- Any Conclusions made
- The list of generated prompt variants (3–5)

Required structure (in order):

```
# Generated Prompts for: <short-task-description>

## Task Summary

...task_summary_content...

## Assumptions

...assumptions_content...

## Findings

...findings_content...

## Conclusions

...conclusions_content...

---

### Variant header with key differentiator (e.g., "Variant 1: Focus on X", "Variant 2: Emphasize Y")

<3 to 5 variants of xml formatted prompt separated via `\n---\n` markdown element, every wrapped with own "```xml" block>
```

## Guardrails

- Do NOT proceed past Step 5 without user answers if the request is ambiguous.
- Do NOT invent file paths, requirements, or context.
- Use **Read/Glob/Grep** before making claims about repo content.
- If an external library is involved, prefer documented sources and cite them.
- Ensure the prompts are concise but complete (no fluff).
- If the task is code-related, include architectural decisions explicitly.
