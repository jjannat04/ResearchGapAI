# ResearchGap AI Skills

This file maps the technical skills used in ResearchGap AI to the actual project features they support. It is intended to make the implementation easy to review for hackathon or coursework marking.

## Skills Usage Matrix

| Skill | Where it is used | Project contribution |
| --- | --- | --- |
| Python | Backend service | Powers the FastAPI API, PDF processing, Gemini request handling, and backend validation. |
| FastAPI | `backend/app/main.py` | Provides the `POST /analyze` endpoint and health check API. |
| Next.js | `frontend/` | Provides the frontend application, routing, build pipeline, and deployed web interface. |
| React | `frontend/app/page.tsx` | Manages upload state, loading states, progressive rendering, and dashboard sections. |
| TypeScript | Frontend types | Defines response types for summaries, comparison rows, gaps, ideas, and extracted paper metadata. |
| Tailwind CSS | Frontend styling | Creates the polished white and blue SaaS interface, responsive layout, cards, tables, and loading states. |
| Gemini API | `backend/app/services/analyzer.py` | Performs paper summarization, methodology extraction, comparison, research gap detection, and novel idea generation. |
| google-genai SDK | Backend AI client | Sends structured prompts to Gemini and requests JSON output using response schema configuration. |
| PDF Processing | `backend/app/services/pdf_utils.py` | Extracts text from uploaded PDFs using `pypdf`. |
| pypdf | PDF text extraction | Reads uploaded PDF bytes and extracts selectable text for analysis. |
| Docker | Deployment readiness | The backend structure is compatible with containerized deployment workflows. |
| Google Cloud Run | Deployment target | The project is designed to run the backend as a cloud-hosted FastAPI service with environment variables. |
| Render / Vercel | Current hosting path | Frontend and backend URLs are configured for public demo deployment. |

## Workflow

1. **Define feature**
   - Identify the user problem: comparing research PDFs and finding gaps.
   - Split work across frontend, backend, AI, DevOps, and documentation responsibilities.

2. **Build implementation**
   - Build upload UI in Next.js.
   - Build PDF upload and extraction endpoint in FastAPI.
   - Add Gemini analysis through `google-genai`.
   - Display structured results in a dashboard.

3. **Review code**
   - Check API response shape.
   - Check frontend state handling and large-response performance.
   - Check Gemini prompt and JSON schema behavior.
   - Check validation and error messages.

4. **Test locally**
   - Run the backend with Uvicorn.
   - Run the frontend with Next.js.
   - Verify frontend build.
   - Verify PDF upload, loading states, and dashboard rendering.

5. **Deploy / demo**
   - Configure frontend API URL.
   - Configure backend environment variables.
   - Present the live demo with Gemini API and cloud deployment badges.

## Best Use of Skills

The most important skill combination in this project is:

```text
PDF Processing + Gemini API + FastAPI + Next.js
```

`pypdf` extracts the raw paper text, FastAPI exposes it through a simple upload endpoint, Gemini transforms the extracted text into research intelligence, and Next.js presents the result as a polished dashboard.

This skill chain is what turns static PDFs into actionable research outputs:

- summaries
- objectives
- methodologies
- findings
- comparison table
- research gaps
- novel research ideas

## Skill-to-Agent Mapping

| Agent | Primary skills |
| --- | --- |
| Frontend Agent | Next.js, React, TypeScript, Tailwind CSS |
| Backend Agent | Python, FastAPI, pypdf, API validation |
| AI Agent | Gemini API, google-genai, prompt engineering, JSON schema output |
| DevOps Agent | environment variables, deployment readiness, Cloud Run workflow |
| Documentation Agent | README writing, demo explanation, project traceability |

## Review Checklist

- Every listed skill maps to a real project feature.
- Gemini API usage is central to the product, not decorative.
- PDF extraction is handled separately from AI reasoning.
- Frontend and backend responsibilities are clearly separated.
- Deployment skills are described as deployment-ready unless a live cloud deployment is confirmed.
