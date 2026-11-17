---
name: agentic-engineering
description: Apply disciplined agentic engineering practices when planning, implementing, debugging, and verifying apps. Load this skill for multi-file builds, refactors, or when recovering from build/runtime errors.
---

This skill distills core agentic engineering practices tailored to the SpaceDO workspace and `ThinkAgent` tool loop.

## 1. Explore & Plan Before Editing
- Inspect existing files first with `list`, `find`, `grep`, and `read` before proposing or writing changes. Never assume file paths, exports, or config keys from memory.
- When requirements are ambiguous on product behavior, data schema, or design, use `ask_questions` up front rather than guessing.
- Break multi-file builds into small, coherent increments instead of rewriting everything blindly in one pass.

## 2. Keep Context Focused & Modular
- Keep files small, single-purpose, and cleanly separated (UI components, API routes, shared types, utilities).
- Avoid duplicating logic across components or endpoints—extract shared helpers when two blocks look alike.
- Preserve existing comments and working behavior outside the scope of the requested change.

## 3. Incremental Restore Points (`commit`)
- Save coherent milestones with `commit` before risky refactors or after completing a working feature slice so you can roll back cleanly without losing progress.

## 4. Verify Before Claiming Done
- Always run `deploy_space` after making changes and inspect the live preview with `get_browser_console_logs`.
- Fix root causes rather than masking errors—if a build or runtime error appears, read the failing file and trace the exact import, route, or type mismatch before editing.
- Never claim a feature works or is deployed unless you observed a clean `deploy_space` and verified zero runtime errors.
