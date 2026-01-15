# Copilot Instructions for KIT

This guide enables AI coding agents to be immediately productive in the KIT codebase. It summarizes architecture, workflows, conventions, and integration points unique to KIT.

## Big Picture Architecture
- **Core App**: Located in `src/kit/`, built on FastAPI + Django. Entry point is `main.py`.
- **Multi-Client Support**: Interfaces for web, desktop, emacs, obsidian, whatsapp, etc. in `src/interface/`.
- **Database**: Uses PostgreSQL with pgvector for vector search. Models and adapters in `src/kit/database/`.
- **Agents & Automation**: Custom agents, automation, and chat logic in `src/kit/routers/` and `src/kit/processor/`.
- **Search & Indexing**: Semantic search, embeddings, and cross-encoder models configured in `src/kit/processor/embeddings.py` and managed via adapters.
- **Scheduler**: Background tasks and scheduled jobs use APScheduler, with distributed leader election via process locks.
- **Content Indexing**: Content from docs, images, PDFs, org-mode, markdown, etc. indexed for search and retrieval.

## Developer Workflows
- **Build/Run**: Use Docker Compose (`docker-compose.yml`) for local dev and production. Main service is `server`. Example:
  ```sh
  docker compose up --build
  ```
- **Entry Point**: `src/kit/main.py` (FastAPI/Django ASGI app). CLI via `kit.main:run` (see `pyproject.toml`).
- **Database Migrations**: Handled automatically on startup. Manual: `python src/kit/manage.py migrate`.
- **Static Files**: Collected on startup. Manual: `python src/kit/manage.py collectstatic`.
- **Testing**: Use `pytest` (see `pytest.ini`, `pyproject.toml`). Example:
  ```sh
  pytest
  ```
- **Linting/Formatting**: Use `ruff` and `mypy` (see `pyproject.toml`). Example:
  ```sh
  ruff check src/kit/
  mypy src/kit/
  ```
- **Configuration**: Environment variables set in Docker Compose. See comments in `docker-compose.yml` for model, API, and feature toggles.

## Project-Specific Conventions
- **Anonymous Mode**: Enabled via CLI or env, disables authentication for quick local use.
- **Distributed Scheduling**: Only one worker executes scheduled jobs, elected via DB process lock.
- **Content Indexing**: Indexes are updated via scheduled jobs and can be triggered for all users.
- **Custom Agents**: Created via API or UI, stored in DB, logic in `src/KIT/routers/api_agents.py`.
- **Search Types**: Dynamically configured from enums and plugins, see `configure_search_types()` in `configure.py`.
- **API Routing**: All API endpoints are under `/api/` (see `configure_routes()` in `configure.py`).
- **CORS**: Custom origins for desktop/mobile clients, set in `main.py`.

## Integration Points & External Dependencies
- **LLM Providers**: Supports OpenAI, Anthropic, Google, HuggingFace, etc. Configure via env vars in Docker Compose.
- **Sandboxing**: Python code execution via Terrarium or E2B, set via `KIT_TERRARIUM_URL` or `E2B_API_KEY`.
- **Web Search**: SearxNG container, or paid APIs (Serper, Firecrawl, Exa, Olostep) via env vars.
- **Telemetry**: Can be disabled via `KIT_TELEMETRY_DISABLE` env var.
- **Database**: Uses pgvector for semantic search, persistent volumes for data.

## Key Files & Directories
- `src/kit/main.py`: App entry point, server setup, scheduler, logging.
- `src/kit/configure.py`: Routing, middleware, authentication, search types, scheduled jobs.
- `src/kit/database/`: Models and adapters for DB access and process locks.
- `src/kit/processor/`: Embeddings, cross-encoder, semantic search logic.
- `src/kit/routers/`: API endpoints for agents, chat, automation, content, etc.
- `docker-compose.yml`: Service orchestration, environment config.
- `pyproject.toml`: Dependencies, scripts, lint/test config.
- `README.md`: High-level overview, links to docs and contributing.

## Examples
- To add a new API route, update `src/KIT/routers/` and register in `configure_routes()`.
- To add a new scheduled job, use `@schedule.repeat` in `configure.py` and ensure leader election logic.
- To support a new LLM provider, add env vars in Docker Compose and update model adapters.

---
For more details, see [documentation/README.md](../../documentation/README.md) and [docs.KIT.dev](https://docs.KIT.dev).
