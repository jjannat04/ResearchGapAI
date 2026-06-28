# ResearchGap AI

ResearchGap AI is a simple local MVP for comparing up to 3 research PDFs and surfacing summaries, comparison points, research gaps, and possible novel ideas.

## Project Structure

```text
ResearchGapAI/
  backend/
    .env.example
    app/
      main.py
      services/
        analyzer.py
        pdf_utils.py
    requirements.txt
  frontend/
    app/
      globals.css
      layout.tsx
      page.tsx
    package.json
    next.config.mjs
    postcss.config.mjs
    tsconfig.json
  requirements.txt
  package.json
```

## Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The API will run at `http://localhost:8000`.

Create `backend/.env` before using `/analyze`:

```text
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```

### Endpoint

`POST /analyze`

Upload 1 to 3 PDF files using the `files` form field.

Response shape:

```json
{
  "extracted_papers": [
    {
      "filename": "",
      "text": ""
    }
  ],
  "summaries": [
    {
      "title": "",
      "objective": "",
      "methodology": "",
      "findings": ""
    }
  ],
  "comparison_table": [],
  "research_gaps": [],
  "novel_ideas": []
}
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

The app will run at `http://localhost:3000`.

The frontend uses Tailwind CSS with an Inter-based white and blue SaaS interface.

If your backend is running on a different URL, create `frontend/.env.local`:

```text
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Notes

- No authentication is included.
- The MVP uses the Gemini API for structured JSON analysis.
- The backend returns extracted PDF text and filenames, but limits the combined text sent to Gemini.
- PDF extraction quality depends on whether the uploaded PDFs contain selectable text.
