# ResearchGap AI Agents

This project was organized using a multi-agent workflow. Each agent owns a clear part of the product so the implementation can be reviewed as a coordinated full-stack system rather than a collection of unrelated files.

## Frontend Agent

**Responsibility:** User experience, file upload flow, dashboard presentation, loading states, and frontend performance.

**Project deliverables:**
- Next.js application in `frontend/`
- drag-and-drop PDF upload experience
- selected file list and maximum 3 PDF UX
- loading spinner, rotating progress messages, and skeleton states
- progressive dashboard rendering for summaries, comparison, gaps, and ideas
- responsive Tailwind CSS interface with a white and blue SaaS theme

**Acceptance criteria:**
- Users can select or drag up to 3 PDFs.
- Analyze button stays disabled until at least 1 PDF is selected.
- UI remains responsive while the backend request is running.
- Large API responses do not freeze the page.
- Results are shown in polished cards and responsive tables.

## Backend Agent

**Responsibility:** API design, PDF validation, PDF text extraction, request handling, and backend error responses.

**Project deliverables:**
- FastAPI backend in `backend/`
- `POST /analyze` endpoint
- multipart PDF upload handling
- PDF text extraction using `pypdf`
- validation for file count, invalid PDFs, encrypted PDFs, and PDFs without selectable text
- structured JSON response for frontend rendering

**Acceptance criteria:**
- API accepts 1 to 3 PDFs.
- API rejects invalid uploads with clear error messages.
- Extracted paper filenames and text are returned.
- Backend does not persist uploaded files.
- Backend returns a predictable response shape.

## AI Agent

**Responsibility:** Gemini API integration, prompt design, structured JSON analysis, and research-gap reasoning.

**Project deliverables:**
- Gemini analysis pipeline in `backend/app/services/analyzer.py`
- `analyze_papers(texts: list[str])`
- prompt instructions for summarization, comparison, gap detection, and idea generation
- JSON schema configuration for Gemini responses
- text limiting before sending content to Gemini
- AI-specific error handling

**Acceptance criteria:**
- Gemini receives only extracted PDF text, not raw files.
- Gemini returns valid JSON only.
- Output includes summaries, comparison table, research gaps, and novel ideas.
- Backend validates required response sections before returning to frontend.
- Missing or invalid Gemini configuration produces a clear error.

## DevOps Agent

**Responsibility:** Local run workflow, environment configuration, deployment readiness, and cloud-facing setup.

**Project deliverables:**
- environment variable pattern using `.env`
- `GEMINI_API_KEY` and `GEMINI_MODELS` configuration
- frontend API URL configuration with `NEXT_PUBLIC_API_URL`
- deployment-ready FastAPI and Next.js structure
- public UI badge showing Gemini API and Google Cloud Run deployment intent

**Acceptance criteria:**
- Backend can run locally with Uvicorn.
- Frontend can run locally with Next.js.
- Secrets are read from environment variables.
- Deployment documentation explains where cloud environment variables belong.
- The project can be presented as Google Cloud Run-ready.

## Documentation Agent

**Responsibility:** Submission materials, README clarity, demo explanation, and judge-facing traceability.

**Project deliverables:**
- `README.md` as the main project documentation
- problem statement and solution overview
- technologies used
- Gemini API usage explanation
- deployment notes
- agent and skill usage documentation

**Acceptance criteria:**
- Judges can understand the product without reading the source code first.
- Gemini API usage is explained clearly.
- `AGENTS.md` and `SKILL.md` are traceable to actual project features.
- Documentation avoids overclaiming storage, authentication, or deployment features.

## Multi-Agent Review Flow

1. **Frontend Agent** validates the user journey and dashboard presentation.
2. **Backend Agent** validates API behavior and PDF extraction.
3. **AI Agent** validates Gemini prompt quality and structured output.
4. **DevOps Agent** validates local/deployment configuration.
5. **Documentation Agent** validates README and submission clarity.

This workflow was used to keep ResearchGap AI aligned with the hackathon criteria: a working MVP, clear Gemini usage, polished UI, and understandable submission documentation.
