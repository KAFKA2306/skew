# Repository Guidelines

## Project Structure & Module Organization
- `src/`: React + TypeScript UI (entry: `src/main.tsx`, app: `src/App.tsx`).
- `index.html`: Vite mount point.
- `src-tauri/`: Rust backend for Tauri 2 (`src-tauri/src/main.rs`).
- Config: `vite.config.ts`, `tsconfig.json`, `src-tauri/tauri.conf.json`.

## Build, Test, and Development Commands
- `npm run dev`: Start Vite dev server for the web UI.
- `npm run tauri dev`: Run desktop app (frontend + Rust backend).
- `npm run build`: Type-check and build production assets.
- `npm run preview`: Serve the built frontend locally.
- `npm run tauri build`: Build production desktop binaries.
- `npm test`: Currently prints "No tests" (no framework configured).

## Coding Style & Naming Conventions
- TypeScript: strict mode enabled; prefer 2-space indentation, camelCase for vars/functions, PascalCase for React components, `.tsx` for components.
- Imports: ES modules; keep paths relative and concise.
- Strings: prefer double quotes to match existing files.
- Rust: idiomatic Rust style; run `cargo fmt` locally before PRs.
- Files: keep React components in `src/` and backend code in `src-tauri/src/`.

## Testing Guidelines
- Status: no tests configured. If adding tests:
  - Frontend: Vitest + React Testing Library (`src/__tests__/*.test.tsx`).
  - Backend: Rust unit/integration tests (`src-tauri/src/**/*_test.rs`).
  - Aim for meaningful coverage around data fetch, analysis, and export paths.
  - Run: `npm test` (frontend) and `cargo test` (backend) if added.

## Commit & Pull Request Guidelines
- Commits: imperative, concise subject (e.g., "Add skewness docs", "Use SVG icon").
- Group related changes; reference issues (`Fixes #123`) when applicable.
- PRs should include:
  - Summary of changes and rationale.
  - Screenshots/GIFs for UI changes (charts, dialogs).
  - Steps to validate (e.g., `npm run tauri dev`, expected behavior).
  - Checklist: builds pass (`npm run build`, `npm run tauri build`).

## Security & Configuration Tips
- No secrets required; Yahoo Finance is accessed anonymously from Rust via `reqwest`.
- Avoid committing generated artifacts (CSV/YAML, packaged apps); update `.gitignore` if needed.
- Keep dependencies minimal; prefer `rustls` TLS (already enabled) and pinned versions.
