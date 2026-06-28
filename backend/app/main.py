from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.services.analyzer import AnalysisError, analyze_papers
from app.services.pdf_utils import PDFExtractionError, extract_pdf_text

app = FastAPI(title="ResearchGap AI API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def root():
    return {"message": "ResearchGap AI Backend Running!"}
@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze")
async def analyze(files: list[UploadFile] = File(...)) -> dict[str, object]:
    if not files:
        raise HTTPException(status_code=400, detail="Upload at least 1 PDF.")

    if len(files) > 3:
        raise HTTPException(status_code=400, detail="Upload up to 3 PDFs only.")

    extracted_papers = []
    for file in files:
        filename = file.filename or "untitled.pdf"
        is_pdf_type = file.content_type in {"application/pdf", "application/x-pdf"}
        is_pdf_name = filename.lower().endswith(".pdf")
        if not is_pdf_type and not is_pdf_name:
            raise HTTPException(status_code=400, detail=f"{file.filename} is not a PDF.")

        content = await file.read()
        try:
            text = extract_pdf_text(content, filename)
        except PDFExtractionError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        if not text.strip():
            raise HTTPException(
                status_code=422,
                detail=f"Could not extract selectable text from {filename}.",
            )

        extracted_papers.append({"filename": filename, "text": text})

    try:
        analysis = analyze_papers([paper["text"] for paper in extracted_papers])
    except AnalysisError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"extracted_papers": extracted_papers, **analysis}


from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)