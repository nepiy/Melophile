# Agent Instructions

## Deployment & Syncing Workflow
- Every time you finish a feature, fix a bug, or complete a user request, you MUST sync the code back to the remote GitHub repository.
- Verify the current git status using `git status` and check the remote using `git remote -v`.
- Do not create a new repository or provide raw patch files unless explicitly asked.
- Always use the existing repository and push to the current working branch.

## Execution Order
1. Implement and test the requested code changes.
2. Run `git add .` and `git commit -m "feat/fix: <descriptive message>"`
3. Run `git push origin <current-branch>` to sync the changes immediately.
