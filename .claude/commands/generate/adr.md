---
name: /generate:adr
description: Generate an Architectural Decision Record (ADR) from the git history of the current feature branch.
---

# Generate ADR from Git History

This command generates an Architectural Decision Record (ADR) from the commit history of the current feature branch.

```bash
#!/bin/bash

# The script is executed from the workspace root, but git repo is in yii-app
if [ -d "yii-app" ]; then
  cd yii-app
else
  echo "Error: yii-app directory not found."
  exit 1
fi

# 1. Identify the current git branch.
BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD)

# Check if we are on main or master
if [ "$BRANCH_NAME" = "main" ] || [ "$BRANCH_NAME" = "master" ]; then
  echo "You are on the main/master branch. No ADR to generate."
  exit 0
fi

# 2. Extract commit messages from the current branch that are not on `main` or `master`.
# Try main first, then master if main doesn't exist.
BASE_BRANCH="main"
if ! git show-ref --quiet refs/heads/$BASE_BRANCH; then
  BASE_BRANCH="master"
  if ! git show-ref --quiet refs/heads/$BASE_BRANCH; then
    echo "Neither main nor master branch found."
    exit 1
  fi
fi

COMMIT_LOGS=$(git log $BASE_BRANCH..$BRANCH_NAME --pretty=format:"- %s")

if [ -z "$COMMIT_LOGS" ]; then
  echo "No new commits on this branch compared to $BASE_BRANCH. No ADR to generate."
  exit 0
fi

# 3. Format these commit messages into a new ADR markdown file.
# 4. The ADR file should be named using the format `YYYYMMDD-adr-summary.md`.
DATE_STAMP=$(date +%Y%m%d)
# Create a summary from the first commit message
FIRST_COMMIT_SUBJECT=$(git log $BASE_BRANCH..$BRANCH_NAME --pretty=format:"%s" | head -n 1)
# Slugify the subject
SUMMARY_SLUG=$(echo "$FIRST_COMMIT_SUBJECT" | iconv -t ascii//TRANSLIT | sed -r 's/[^a-zA-Z0-9]+/-/g' | sed -r 's/^-+|-$//g' | tr '[:upper:]' '[:lower:]')

ADR_DIR="docs/adr"
FILE_NAME="${DATE_STAMP}-${SUMMARY_SLUG}.md"
FILE_PATH="${ADR_DIR}/${FILE_NAME}"

# Create directory if it doesn't exist
mkdir -p $ADR_DIR

# Create ADR content
ADR_TITLE=$(echo "$FIRST_COMMIT_SUBJECT" | sed 's/.*/\u&/') # Capitalize first letter
ADR_CONTENT=$(cat <<EOF
# ADR: $ADR_TITLE

**Date:** $(date +"%Y-%m-%d")

**Status:** Proposed

## Context

This ADR is generated from the commits on the branch \`$BRANCH_NAME\`.

## Decision

The following changes were made:

$COMMIT_LOGS

## Consequences

*Consequences of this decision.*
EOF
)

# 5. Save the new ADR file in the `docs/adr/` directory.
echo "$ADR_CONTENT" > "$FILE_PATH"

echo "ADR generated at: $FILE_PATH"
```

Then make enhancements to ADR's `$FILE_PATH`:

- replace *Consequences of this decision.* with actual consequences
- add links to related ADRs if any
- add more context if needed
  All changes should be done in the `$FILE_PATH` file.
