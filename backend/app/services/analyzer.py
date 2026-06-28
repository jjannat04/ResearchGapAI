import json
import logging
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from google import genai
from google.genai import errors as genai_errors
from google.genai import types

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=ENV_PATH)

DEFAULT_MODEL = "gemini-2.5-flash-lite"
MAX_TOTAL_CHARS_TO_GEMINI = 30000
TRUNCATION_MARKER = "\n[Text truncated before Gemini analysis.]"
RATE_LIMIT_MESSAGE = "The AI service is currently experiencing high demand. Please try again in a few minutes."

logger = logging.getLogger(__name__)


class AnalysisError(RuntimeError):
    pass


class GeminiRateLimitError(AnalysisError):
    pass


ANALYSIS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "summaries": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "objective": {"type": "string"},
                    "methodology": {"type": "string"},
                    "findings": {"type": "string"},
                },
                "required": ["title", "objective", "methodology", "findings"],
            },
        },
        "comparison_table": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "paper": {"type": "string"},
                    "objective": {"type": "string"},
                    "methodology": {"type": "string"},
                    "dataset_or_scope": {"type": "string"},
                    "key_findings": {"type": "string"},
                    "limitations": {"type": "string"},
                },
                "required": [
                    "paper",
                    "objective",
                    "methodology",
                    "dataset_or_scope",
                    "key_findings",
                    "limitations",
                ],
            },
        },
        "research_gaps": {
            "type": "array",
            "items": {"type": "string"},
        },
        "novel_ideas": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": ["summaries", "comparison_table", "research_gaps", "novel_ideas"],
}


def analyze_papers(texts: list[str]) -> dict[str, list]:
    if not texts:
        raise AnalysisError("No paper text was provided for analysis.")

    load_dotenv(dotenv_path=ENV_PATH, override=True)
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise AnalysisError("GEMINI_API_KEY is missing. Add it to backend/.env and restart the server.")

    limited_texts = _limit_total_text(texts)
    client = genai.Client(api_key=api_key)
    model = os.getenv("GEMINI_MODEL", DEFAULT_MODEL)

    try:
        response = client.models.generate_content(
            model=model,
            contents=_build_prompt(limited_texts),
            config=types.GenerateContentConfig(
                systemInstruction=(
                    "You are ResearchGap AI, an expert academic research assistant. "
                    "Analyze papers precisely and return only valid JSON."
                ),
                responseMimeType="application/json",
                responseJsonSchema=ANALYSIS_SCHEMA,
                temperature=0.2,
            ),
        )
    except genai_errors.ClientError as exc:
        logger.exception("Gemini client request failed.")
        if _is_rate_limit_error(exc):
            raise GeminiRateLimitError(RATE_LIMIT_MESSAGE) from exc
        raise AnalysisError("Gemini request failed. Please try again later.") from exc
    except genai_errors.ServerError as exc:
        logger.exception("Gemini service returned a server error.")
        raise AnalysisError("Gemini service is temporarily unavailable. Try again shortly.") from exc
    except genai_errors.APIError as exc:
        logger.exception("Gemini API request failed.")
        if _is_rate_limit_error(exc):
            raise GeminiRateLimitError(RATE_LIMIT_MESSAGE) from exc
        raise AnalysisError("Gemini API error. Please try again later.") from exc
    except Exception as exc:
        logger.exception("Unexpected Gemini analysis failure.")
        raise AnalysisError("Gemini analysis failed. Please try again later.") from exc

    try:
        data = json.loads(response.text or "")
    except (AttributeError, TypeError, json.JSONDecodeError) as exc:
        raise AnalysisError("Gemini returned an invalid JSON response.") from exc

    return _validate_analysis(data)


def _build_prompt(texts: list[str]) -> str:
    papers = []
    for index, text in enumerate(texts, start=1):
        papers.append(f"Paper {index}:\n{text}")

    return (
        "You are ResearchGap AI, an expert academic research assistant.\n\n"
        "Analyze the extracted text from the uploaded papers and return valid JSON only.\n\n"
        "Tasks:\n"
        "1. Summarize each paper.\n"
        "2. Extract each paper's objective, methodology, and findings.\n"
        "3. Compare the papers in comparison_table.\n"
        "4. Identify cross-paper research gaps.\n"
        "5. Suggest novel research directions.\n\n"
        "Rules:\n"
        "- Return JSON only. Do not include markdown fences or commentary.\n"
        "- Match the provided JSON schema exactly.\n"
        "- If a detail is not clearly present, write 'Not clearly stated'.\n"
        "- Base every claim on the provided paper text.\n"
        "- Keep the writing concise and useful for a researcher.\n\n"
        "Papers:\n\n"
        + "\n\n---\n\n".join(papers)
    )


def _limit_total_text(texts: list[str]) -> list[str]:
    cleaned = [" ".join(text.split()) for text in texts]
    total_length = sum(len(text) for text in cleaned)
    if total_length <= MAX_TOTAL_CHARS_TO_GEMINI:
        return cleaned

    per_paper_limit = max(1, MAX_TOTAL_CHARS_TO_GEMINI // len(cleaned))
    limited = []
    for text in cleaned:
        if len(text) <= per_paper_limit:
            limited.append(text)
        elif per_paper_limit <= len(TRUNCATION_MARKER):
            limited.append(text[:per_paper_limit])
        else:
            limited.append(text[: per_paper_limit - len(TRUNCATION_MARKER)] + TRUNCATION_MARKER)

    return limited


def _is_rate_limit_error(exc: Exception) -> bool:
    status_code = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    if str(status_code) == "429":
        return True

    reason = str(getattr(exc, "status", "") or getattr(exc, "reason", "") or "").upper()
    message = str(exc).lower()
    return (
        "resource_exhausted" in reason
        or "rate limit" in message
        or "quota" in message
        or "resource exhausted" in message
        or "too many requests" in message
    )


def _validate_analysis(data: Any) -> dict[str, list]:
    if not isinstance(data, dict):
        raise AnalysisError("Gemini analysis response was not a JSON object.")

    required_keys = ["summaries", "comparison_table", "research_gaps", "novel_ideas"]
    for key in required_keys:
        if key not in data or not isinstance(data[key], list):
            raise AnalysisError(f"Gemini analysis response is missing '{key}'.")

    return {key: data[key] for key in required_keys}
