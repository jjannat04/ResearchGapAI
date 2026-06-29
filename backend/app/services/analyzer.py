import json
import logging
import os
import time
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from google import genai
from google.genai import errors as genai_errors
from google.genai import types

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=ENV_PATH)

DEFAULT_MODEL = "gemini-2.5-flash-lite"
GEMINI_TIMEOUT_SECONDS = 90
MAX_TOTAL_CHARS_TO_GEMINI = 50000
TRUNCATION_MARKER = "\n[Text truncated before Gemini analysis.]\n"
RATE_LIMIT_MESSAGE = "The AI service is currently experiencing high demand. Please try again in a few minutes."
TIMEOUT_MESSAGE = "The AI service took too long to respond. Please try again in a few minutes."
logger = logging.getLogger(__name__)


class AnalysisError(RuntimeError):
    pass


class GeminiRateLimitError(AnalysisError):
    pass


class GeminiTimeoutError(AnalysisError):
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

    started_at = time.monotonic()
    limited_texts = _limit_total_text(texts)
    limited_text_size = sum(len(text) for text in limited_texts)
    model = os.getenv("GEMINI_MODEL", DEFAULT_MODEL)
    client = genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(timeout=GEMINI_TIMEOUT_SECONDS * 1000),
    )
    log_context = {
        "gemini_model": model,
        "paper_count": len(limited_texts),
        "limited_text_size": limited_text_size,
        "timeout_seconds": GEMINI_TIMEOUT_SECONDS,
    }

    logger.info("Starting Gemini analysis.", extra=log_context)

    try:
        response = client.models.generate_content(
            model=model,
            contents=_build_prompt(limited_texts),
            config=types.GenerateContentConfig(
                systemInstruction=(
                                "You are ResearchGap AI, an expert academic research assistant. "
                                "Base every statement strictly on the provided paper text. "
                                "Do not fabricate details or citations. "
                                "Return only valid JSON matching the provided schema."
                            ),
                responseMimeType="application/json",
                responseJsonSchema=ANALYSIS_SCHEMA,
                temperature=0.2,
            ),

        )
        if not getattr(response, "text", None):
            raise AnalysisError(
                "The AI service returned an empty response. Please try again."
            )
    except genai_errors.ClientError as exc:
        logger.exception("Gemini client request failed.", extra=_elapsed_context(log_context, started_at))
        if _is_rate_limit_error(exc):
            raise GeminiRateLimitError(RATE_LIMIT_MESSAGE) from exc
        if _is_timeout_error(exc):
            raise GeminiTimeoutError(TIMEOUT_MESSAGE) from exc
        raise AnalysisError("Gemini request failed. Please try again later.") from exc
    except genai_errors.ServerError as exc:
        logger.exception("Gemini service returned a server error.", extra=_elapsed_context(log_context, started_at))
        if _is_timeout_error(exc):
            raise GeminiTimeoutError(TIMEOUT_MESSAGE) from exc
        raise AnalysisError("Gemini service is temporarily unavailable. Try again shortly.") from exc
    except genai_errors.APIError as exc:
        logger.exception("Gemini API request failed.", extra=_elapsed_context(log_context, started_at))
        if _is_rate_limit_error(exc):
            raise GeminiRateLimitError(RATE_LIMIT_MESSAGE) from exc
        if _is_timeout_error(exc):
            raise GeminiTimeoutError(TIMEOUT_MESSAGE) from exc
        raise AnalysisError("Gemini API error. Please try again later.") from exc
    except Exception as exc:
        logger.exception("Unexpected Gemini analysis failure.", extra=_elapsed_context(log_context, started_at))
        if _is_timeout_error(exc):
            raise GeminiTimeoutError(TIMEOUT_MESSAGE) from exc
        raise AnalysisError("Gemini analysis failed. Please try again later.") from exc

    logger.info(
        "Gemini analysis completed.",
        extra=_elapsed_context(log_context, started_at),
    )

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

    per_paper_limit = max(
        1,
        MAX_TOTAL_CHARS_TO_GEMINI // len(cleaned),
    )

    limited = []

    for text in cleaned:
        if len(text) <= per_paper_limit:
            limited.append(text)
            continue

        if per_paper_limit <= len(TRUNCATION_MARKER):
            limited.append(text[:per_paper_limit])
            continue

        head = per_paper_limit // 2
        tail = (
            per_paper_limit
            - head
            - len(TRUNCATION_MARKER)
        )

        limited.append(
            text[:head]
            + TRUNCATION_MARKER
            + text[-tail:]
        )

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


def _is_timeout_error(exc: Exception) -> bool:
    status_code = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    if str(status_code) in {"408", "504"}:
        return True

    name = type(exc).__name__.lower()
    message = str(exc).lower()
    return "timeout" in name or "timed out" in message or "read timeout" in message


def _elapsed_context(context: dict[str, object], started_at: float) -> dict[str, object]:
    return {**context, "elapsed_seconds": round(time.monotonic() - started_at, 2)}


def _validate_analysis(data: Any) -> dict[str, list]:
    if not isinstance(data, dict):
        raise AnalysisError("Gemini analysis response was not a JSON object.")

    required_keys = ["summaries", "comparison_table", "research_gaps", "novel_ideas"]
    for key in required_keys:
        if key not in data or not isinstance(data[key], list):
            raise AnalysisError(f"Gemini analysis response is missing '{key}'.")

    return {key: data[key] for key in required_keys}
