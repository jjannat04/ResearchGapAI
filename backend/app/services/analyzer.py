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

GEMINI_TIMEOUT_SECONDS = 90
MAX_TOTAL_CHARS_TO_GEMINI = 50000
TRUNCATION_MARKER = "\n[Text truncated before Gemini analysis.]\n"
RATE_LIMIT_MESSAGE = "The AI service is currently experiencing high demand. Please try again in a few minutes."
TIMEOUT_MESSAGE = "The AI service took too long to respond. Please try again in a few minutes."
CONFIGURATION_MESSAGE = "Gemini model configuration is missing. Set GEMINI_MODELS on the backend."
logger = logging.getLogger(__name__)


class AnalysisError(RuntimeError):
    pass


class GeminiRateLimitError(AnalysisError):
    pass


class GeminiTimeoutError(AnalysisError):
    pass


class GeminiServiceError(AnalysisError):
    pass


class GeminiConfigurationError(AnalysisError):
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


def get_gemini_models() -> list[str]:
    load_dotenv(dotenv_path=ENV_PATH, override=True)
    raw_models = os.getenv("GEMINI_MODELS", "").strip() or os.getenv("GEMINI_MODEL", "").strip()
    models = []

    for model in raw_models.split(","):
        cleaned_model = model.strip()
        if cleaned_model and cleaned_model not in models:
            models.append(cleaned_model)

    if not models:
        raise GeminiConfigurationError(CONFIGURATION_MESSAGE)

    return models


def get_gemini_config() -> dict[str, object]:
    models = get_gemini_models()
    return {"gemini_models": models, "active_model": models[0]}


def get_analysis_timeout_seconds() -> int:
    return GEMINI_TIMEOUT_SECONDS * len(get_gemini_models())


def analyze_papers(texts: list[str]) -> dict[str, object]:
    if not texts:
        raise AnalysisError("No paper text was provided for analysis.")

    load_dotenv(dotenv_path=ENV_PATH, override=True)
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise AnalysisError("GEMINI_API_KEY is missing. Add it to backend/.env and restart the server.")

    models = get_gemini_models()
    limited_texts = _limit_total_text(texts)
    limited_text_size = sum(len(text) for text in limited_texts)
    client = genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(timeout=GEMINI_TIMEOUT_SECONDS * 1000),
    )
    base_context = {
        "paper_count": len(limited_texts),
        "limited_text_size": limited_text_size,
        "timeout_seconds": GEMINI_TIMEOUT_SECONDS,
        "configured_model_count": len(models),
    }

    last_error: AnalysisError | None = None
    last_failure_category = ""

    for index, model in enumerate(models):
        started_at = time.monotonic()
        log_context = {
            **base_context,
            "gemini_model": model,
            "model_attempt": index + 1,
            "remaining_fallbacks": len(models) - index - 1,
        }

        logger.info("Starting Gemini model attempt.", extra=log_context)

        try:
            response_text = _generate_content(client, model, limited_texts, log_context, started_at)
            data = json.loads(response_text)
            validated = _validate_analysis(data)
        except json.JSONDecodeError as exc:
            logger.exception("Gemini returned invalid JSON.", extra=_elapsed_context(log_context, started_at))
            raise AnalysisError("Gemini returned an invalid JSON response.") from exc
        except GeminiRateLimitError as exc:
            last_error = exc
            last_failure_category = "rate_limit"
            _log_fallback_attempt("Gemini model quota or rate limit reached.", log_context, started_at)
            continue
        except GeminiTimeoutError as exc:
            last_error = exc
            last_failure_category = "timeout"
            _log_fallback_attempt("Gemini model attempt timed out.", log_context, started_at)
            continue
        except GeminiServiceError as exc:
            last_error = exc
            last_failure_category = "service"
            _log_fallback_attempt("Gemini model service/API failure.", log_context, started_at)
            continue

        logger.info("Gemini analysis completed.", extra=_elapsed_context(log_context, started_at))
        return {"gemini_model": model, **validated}

    if last_failure_category == "rate_limit":
        raise GeminiRateLimitError(RATE_LIMIT_MESSAGE) from last_error

    if last_failure_category == "timeout":
        raise GeminiTimeoutError(TIMEOUT_MESSAGE) from last_error

    raise AnalysisError("Gemini API error. Please try again later.") from last_error


def _generate_content(
    client: genai.Client,
    model: str,
    limited_texts: list[str],
    log_context: dict[str, object],
    started_at: float,
) -> str:
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
        raise GeminiServiceError("Gemini service is temporarily unavailable. Try again shortly.") from exc
    except genai_errors.APIError as exc:
        logger.exception("Gemini API request failed.", extra=_elapsed_context(log_context, started_at))
        if _is_rate_limit_error(exc):
            raise GeminiRateLimitError(RATE_LIMIT_MESSAGE) from exc
        if _is_timeout_error(exc):
            raise GeminiTimeoutError(TIMEOUT_MESSAGE) from exc
        raise GeminiServiceError("Gemini API error. Please try again later.") from exc
    except Exception as exc:
        logger.exception("Unexpected Gemini analysis failure.", extra=_elapsed_context(log_context, started_at))
        if _is_timeout_error(exc):
            raise GeminiTimeoutError(TIMEOUT_MESSAGE) from exc
        raise AnalysisError("Gemini analysis failed. Please try again later.") from exc

    return response.text or ""


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


def _log_fallback_attempt(message: str, context: dict[str, object], started_at: float) -> None:
    logger.warning(message, extra=_elapsed_context(context, started_at), exc_info=True)


def _validate_analysis(data: Any) -> dict[str, list]:
    if not isinstance(data, dict):
        raise AnalysisError("Gemini analysis response was not a JSON object.")

    required_keys = ["summaries", "comparison_table", "research_gaps", "novel_ideas"]
    for key in required_keys:
        if key not in data or not isinstance(data[key], list):
            raise AnalysisError(f"Gemini analysis response is missing '{key}'.")

    return {key: data[key] for key in required_keys}
