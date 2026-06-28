from io import BytesIO

from pypdf import PdfReader
from pypdf.errors import PdfReadError


class PDFExtractionError(RuntimeError):
    pass


def extract_pdf_text(content: bytes, filename: str = "uploaded file") -> str:
    if not content:
        raise PDFExtractionError(f"{filename} is empty.")

    if not content.lstrip().startswith(b"%PDF"):
        raise PDFExtractionError(f"{filename} does not appear to be a valid PDF.")

    try:
        reader = PdfReader(BytesIO(content))
    except PdfReadError as exc:
        raise PDFExtractionError(f"Could not read {filename} as a PDF.") from exc

    if reader.is_encrypted:
        raise PDFExtractionError(f"{filename} is encrypted and cannot be processed.")

    pages = []

    try:
        for page in reader.pages:
            pages.append(page.extract_text() or "")
    except PdfReadError as exc:
        raise PDFExtractionError(f"Could not extract text from {filename}.") from exc

    return "\n\n".join(pages).strip()
