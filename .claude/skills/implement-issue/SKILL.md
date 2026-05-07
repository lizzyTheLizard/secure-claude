---
name: implement-issue
description: Use this skill when the user wants to implement a GitHub issue. Guides the full flow from selecting an issue, gathering designs and information, creating an implementation plan, branching, working, and finally committing/pushing and opening a PR.
version: 0.1.0
---

# Implement GitHub Issue

Guide the user from selecting a GitHub issue through implementation, commit, and PR — in a structured, checklist-driven flow.

## Workflow

### Step 0: Check if this is an ongoing implementation

If the current branch is already in the form issue-#NUMBER-short-title-with-dashes, ask if you should continue with the implementation of this issue. If so, go directly to step 5 (skipping steps 1–4, which are already done), assuming the implementation has finished and the user is still doing the review.

### Step 1: Select the issue

If the user has not already specified an issue number, list open issues so they can pick one:

```bash
gh issue list --state open
```

Ask the user which issue they want to work on if it is not already clear.

Once an issue is identified, fetch its full details:

```bash
gh issue view <NUMBER> --json number,title,body,labels,comments
```

Read and summarise the issue for the user: title, user story, acceptance criteria, and any technical notes.

### Step 2: Gather all information and ask clarifying questions

Before writing the plan, make sure every question is answered. Ask **one question at a time** and wait for the answer. Cover only what is not already clear from the issue or design:

- Are there related issues, dependencies, or blocked work?
- Are there open questions in the issue comments that are not yet resolved?
- Are there edge cases or error states not covered by the acceptance criteria?
- Are there any known constraints (performance, security, backwards compatibility)?
- Are there specific test cases or scenarios that must be covered?
- Is there something you do not understand fully?
- Do you need new libraries or think that a library would help and this is not yet stated in the issue?
- Are there any architectural decisions or implementation details open?

Stop asking once all acceptance criteria can be met without ambiguity.

### Step 3: Create an implementation plan

Write a numbered implementation plan that the user must approve before any code is written. The plan must include:

1. **Branch name** — format: `issue-#NUMBER-short-title-with-dashes` (lowercase, no special characters)
2. **Files to create or modify** — list each file and what changes are needed
3. **Tests** — list new or updated test files (`*.unit.test.ts` for unit, `*.integration.test.ts` for integration)
4. **Order of implementation** — a step-by-step sequence that avoids breaking intermediate states

Present the plan and ask: "Does this plan look correct? Should I adjust anything before I start?"

Do not write any code until the plan is approved.

### Step 4: Create the branch and start implementing

Once the user approves the plan, ensure the working tree starts from a clean, up-to-date main:

```bash
git checkout main
git pull
```

If there are uncommitted changes on the current branch, stop and ask the user how to handle them before switching.

Then create and switch to the feature branch:

```bash
git checkout -b issue-#NUMBER-short-title-with-dashes
```

Implement the plan step by step in the agreed order. After each logical chunk, briefly report what was done and what comes next. If it makes sense run unit tests, linter and a build to check that the implementation actually works. Do NOT run integration tests in this stage.


### Step 5: User Review

When finished the implementation, ask the user to check and review everything. Answer their questions and perform changes they request. Challenge changes and remind them of the acceptance criteria if they cannot be met with the requested changes. Only move forward if the user clearly states that the review is finished.

### Step 6: Commit and Push

When the user has finished their review, create a commit with a short, punchy message that references the issue and push the issue

```bash
git add <relevant files>
git commit -m "$(cat <<'EOF'
<short imperative message> (#NUMBER)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
git push -u origin HEAD
```

Message rules:
- Imperative mood, present tense ("Add", "Fix", "Wire up" — not "Added" or "Adding")
- Under 72 characters for the subject line
- Reference the issue number in parentheses at the end: `(#NUMBER)`

Before you commit, run the following checks in order:

1. **Lint:**
   ```bash
   pnpm lint
   ```
   Fix any lint errors before proceeding.

2. **Build:**
   ```bash
   pnpm build
   ```
   Fix any build errors before proceeding.

3. **Unit-Tests:**
   ```bash
   pnpm vitest run .unit.test
   ```
   All tests must pass. Fix any failures before proceeding.

4. **Integration-Tests:**
   ```bash
   pnpm vitest run .integration.test
   ```
   Only run if the user explicitly commands it. Fix any failures before proceeding. Only ask the user to run integration tests if the changes are expected to affect them or if the issue specifically requires it.

Report the outcome of each check to the user. Only proceed to commit once all checks pass.

### Step 7: Open a Pull Request

After pushing, ask the user if they want to create a PR. If so, open one that auto-closes the issue on merge:

```bash
gh pr create --title "<short title> (#NUMBER)" --body "$(cat <<'EOF'
## Summary

<2–4 bullets describing what was done>

Closes #NUMBER
EOF
)"
```

PR rules:
- Title is short and clear, with the issue number in parentheses
- Body uses `Closes #NUMBER` so GitHub auto-closes the issue on merge
- Keep the body concise — the issue already contains the full context

Return the PR URL to the user when done.

## Guidelines

- Never write code before the implementation plan is approved.
- Never commit without running lint and build and unit tests first.
- Never commit without explicit user confirmation
- Never run integration tests without explicit user confirmation and only if relevant to the changes.
- Always use `Closes #NUMBER` in the PR body.
- One clarifying question at a time — never ask multiple questions in a single message.
- If the issue changes significantly during implementation (scope creep, new information), flag it to the user and revise the plan before continuing.
