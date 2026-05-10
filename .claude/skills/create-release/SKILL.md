---
name: create-release
description: Use this skill when the user wants to create a new release, bump the version, or prepare release notes. Guides the full flow from inspecting changes since the last release, proposing a semver bump and release notes, to creating a branch and opening a PR.
version: 0.1.0
---

# Create Release

Guide the user from the current state of the codebase to a merged release PR — inspecting changes, proposing a semver bump and release notes, then creating a branch and opening a PR.

## Workflow

### Step 1: Inspect changes since the last release

Find the most recent release tag and list commits since then:

```bash
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "$LAST_TAG" ]; then
  git log "$LAST_TAG..HEAD" --oneline
else
  git log --oneline
fi
```

Also read the current version from `package.json`.

### Step 2: Propose a semver bump

Based on the commits since the last release, propose a version bump following semver:
- **patch** (x.x.N) — bug fixes only, no new features, no breaking changes
- **minor** (x.N.0) — new backwards-compatible features
- **major** (N.0.0) — breaking changes

Present the commit list and your reasoning, then ask the user to confirm or override the bump type.

### Step 3: Propose release notes

Draft a `## <new-version>` section for `RELEASE_NOTES.md` summarising the changes. Group by type if there are many commits (Features, Fixes, etc.). Keep it concise and user-facing.

Show the draft to the user and ask for confirmation or edits. Wait for approval before continuing.

### Step 4: Create a branch and implement

Once the user approves the version and release notes, create a branch:

```bash
git checkout main && git pull
git checkout -b release/v<new-version>
```

Make the changes:
1. Update `version` in `package.json` to `<new-version>`
2. Prepend the new `## <new-version>` section to `RELEASE_NOTES.md` (keep existing sections below)

Verify locally:

```bash
pnpm check-release
```

Fix any issues before continuing.

### Step 5: Commit and push

```bash
git add package.json RELEASE_NOTES.md
git commit -m "$(cat <<'EOF'
Release v<new-version>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
git push -u origin HEAD
```

### Step 6: Open a PR

```bash
gh pr create --title "Release v<new-version>" --body "$(cat <<'EOF'
## Summary

- Bump version to <new-version>
- Add release notes for <new-version>

<paste the release notes section here>
EOF
)"
```

Return the PR URL to the user.

## Guidelines

- Never skip asking for confirmation on the version bump and release notes — both need explicit user approval.
- Always run `pnpm check-release` after making changes and before pushing.
- Use `release/v<version>` as the branch naming convention.
- Do not modify any source code — this PR contains only `package.json` and `RELEASE_NOTES.md` changes.
- Do not create git tags or publish to npm directly — the CI pipeline handles that on merge to `main`. Use `pnpm version` only with `--no-git-tag-version` or similar to bypass the normal flow.
