"""AI helpers for the Design Concept module.

Native SDKs — no ``emergentintegrations``:
  1. Gemini 2.5 Flash Image ("Nano Banana") via ``google-genai`` — restyles the
     uploaded reference photo while preserving room structure.
  2. Claude Sonnet 5 via ``anthropic`` — strict-JSON itemized cost estimate
     (retry once on malformed output).

Both keys are read from ``backend/.env`` (``GEMINI_API_KEY`` and
``ANTHROPIC_API_KEY``). Clients are constructed lazily so the backend can boot
even when a key is temporarily missing; a clean, actionable error is raised
only when the pipeline is actually invoked.
"""
import json
import logging
import os
import re
import uuid

logger = logging.getLogger(__name__)

IMAGE_MODEL = "gemini-2.5-flash-image"
COST_MODEL = "claude-sonnet-5"

COST_CATEGORIES = ["Flooring", "Paint/Wall Finish", "Furniture",
                     "Lighting", "Fixtures", "Labour"]


# ---------------------------------------------------------------------------
# Lazy SDK clients
# ---------------------------------------------------------------------------

_gemini_client = None
_anthropic_client = None


def _get_gemini():
    global _gemini_client
    if _gemini_client is not None:
        return _gemini_client
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Add it to backend/.env and restart the "
            "backend. Get a key at https://aistudio.google.com/api-keys."
        )
    try:
        from google import genai  # type: ignore
    except ModuleNotFoundError as e:
        raise RuntimeError(
            "The `google-genai` package is not installed. Run:\n"
            "  pip install google-genai\n"
            "then restart the backend."
        ) from e
    _gemini_client = genai.Client(api_key=key)
    return _gemini_client


def _get_anthropic():
    global _anthropic_client
    if _anthropic_client is not None:
        return _anthropic_client
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. Add it to backend/.env and restart "
            "the backend. Get a key at https://console.anthropic.com/."
        )
    try:
        from anthropic import AsyncAnthropic  # type: ignore
    except ModuleNotFoundError as e:
        raise RuntimeError(
            "The `anthropic` package is not installed. Run:\n"
            "  pip install anthropic\n"
            "then restart the backend."
        ) from e
    # Identity-linked keys require an ``anthropic-workspace-id`` header.
    workspace_id = os.environ.get("ANTHROPIC_WORKSPACE_ID", "").strip()
    extra = {"default_headers": {"anthropic-workspace-id": workspace_id}} if workspace_id else {}
    _anthropic_client = AsyncAnthropic(api_key=key, **extra)
    return _anthropic_client


# ---------------------------------------------------------------------------
# Image render — Gemini 2.5 Flash Image
# ---------------------------------------------------------------------------

def _restyle_prompt(space_type: str, style: str) -> str:
    return (
        f"Restyle this {space_type.lower()} in a {style} interior design style. "
        "STRICTLY preserve the room's architectural layout — walls, windows, doors, "
        "ceiling, and the position of large fixed elements. Do not change the "
        "camera angle. Update surfaces (walls, floor), furniture, decor, textiles, "
        "and lighting to match the requested style. Produce a photorealistic, "
        "professionally photographed interior design render suitable for a client "
        "presentation. Realistic lighting, no text or watermarks."
    )


def _sniff_mime(reference_bytes: bytes) -> str:
    if reference_bytes.startswith(b"\x89PNG"):
        return "image/png"
    if reference_bytes.startswith(b"\xff\xd8"):
        return "image/jpeg"
    if reference_bytes[:4] == b"RIFF" and reference_bytes[8:12] == b"WEBP":
        return "image/webp"
    return "image/png"


async def generate_render(reference_bytes: bytes, space_type: str, style: str) -> bytes:
    """Return PNG/JPEG bytes of a restyled render, preserving room structure.

    Raises RuntimeError on failure.
    """
    client = _get_gemini()
    from google.genai import types  # type: ignore

    mime = _sniff_mime(reference_bytes)
    reference = types.Part.from_bytes(data=reference_bytes, mime_type=mime)
    prompt = _restyle_prompt(space_type, style)

    response = await client.aio.models.generate_content(
        model=IMAGE_MODEL,
        contents=[reference, prompt],
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE"],
        ),
    )

    # Response may include multiple parts (text + image). Return the first
    # inline image payload.
    for cand in response.candidates or []:
        for part in getattr(cand.content, "parts", None) or []:
            data = getattr(getattr(part, "inline_data", None), "data", None)
            if data:
                return data
    raise RuntimeError("Gemini returned no image")


# ---------------------------------------------------------------------------
# Cost estimate — Claude Sonnet 5
# ---------------------------------------------------------------------------

def _cost_system() -> str:
    return (
        "You are a senior construction cost estimator for India. You produce "
        "itemized renovation estimates in INR (Indian rupees). ALWAYS respond "
        "with a single JSON object matching the requested schema — no prose, no "
        "markdown fences, no explanation."
    )


def _cost_user_prompt(space_type: str, style: str, sqft: float, region: str) -> str:
    cats = ", ".join(COST_CATEGORIES)
    return (
        f"Generate a realistic renovation cost estimate for a {sqft} sq ft "
        f"{space_type} restyled in {style} style, in {region}. Return between 8 "
        f"and 14 line items spanning these categories: {cats}. Rates should be "
        f"credible mid-market {region} prices in INR.\n\n"
        "Return this exact JSON shape and NOTHING else:\n"
        "{\n"
        '  "lines": [\n'
        '    {\n'
        '      "category": "one of Flooring | Paint/Wall Finish | Furniture | Lighting | Fixtures | Labour",\n'
        '      "description": "short human description",\n'
        '      "quantity": 12.5,\n'
        '      "unit": "sqft | pcs | day | job | m",\n'
        '      "rate": 250,\n'
        '      "subtotal": 3125\n'
        '    }\n'
        '  ]\n'
        "}\n\n"
        "Rules:\n"
        "- subtotal MUST equal round(quantity * rate).\n"
        "- All amounts are plain numbers (no INR symbol, no commas).\n"
        "- Include labour separately (skilled + helper as a single Labour line "
        "  or split as needed).\n"
        "- No trailing commentary."
    )


_JSON_BLOCK = re.compile(r"\{[\s\S]*\}")


def _parse_lines(raw: str) -> list[dict]:
    """Extract and validate the `lines` array. Raises ValueError on failure."""
    match = _JSON_BLOCK.search(raw or "")
    if not match:
        raise ValueError("No JSON object found in model output")
    obj = json.loads(match.group(0))
    lines = obj.get("lines")
    if not isinstance(lines, list) or not lines:
        raise ValueError("`lines` missing or empty")
    cleaned = []
    for li in lines:
        try:
            qty = float(li.get("quantity", 0))
            rate = float(li.get("rate", 0))
        except (TypeError, ValueError):
            continue
        subtotal = float(li.get("subtotal", 0)) or round(qty * rate, 2)
        cleaned.append({
            "category": str(li.get("category", "Furniture"))[:60],
            "description": str(li.get("description", ""))[:200],
            "quantity": round(qty, 2),
            "unit": str(li.get("unit", "unit"))[:20],
            "rate": round(rate, 2),
            "subtotal": round(subtotal, 2),
        })
    if not cleaned:
        raise ValueError("All lines failed validation")
    return cleaned


async def generate_cost_estimate(space_type: str, style: str, sqft: float,
                                    region: str = "India") -> list[dict]:
    """Return validated cost lines. One retry on malformed JSON."""
    client = _get_anthropic()
    prompt = _cost_user_prompt(space_type, style, sqft, region)
    system = _cost_system()

    for attempt in (1, 2):
        message = await client.messages.create(
            model=COST_MODEL,
            max_tokens=4096,
            system=system,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(
            b.text for b in (message.content or []) if getattr(b, "type", None) == "text"
        ).strip()
        try:
            return _parse_lines(text)
        except (ValueError, json.JSONDecodeError) as e:
            logger.warning("Cost JSON parse failed (attempt %d, session=%s): %s",
                             attempt, uuid.uuid4().hex[:8], e)
            if attempt == 2:
                raise RuntimeError(f"Cost estimate malformed after retry: {e}")
    return []
