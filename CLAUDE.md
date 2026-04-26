# Sentinel Monorepo

## Structure
- pipeline/ — Python pipeline, runs on Render cron job
- frontend/ — Vite + React frontend, Render static site

## Rules
- Never mix pipeline and frontend dependencies
- Pipeline: Python/pip, entry point is pipeline/pipeline.py
- Frontend: Node/npm, entry point is frontend/
- Each subdirectory has its own dependency files
