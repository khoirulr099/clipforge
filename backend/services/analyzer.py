import json
import openai
from typing import List
from pydantic import BaseModel
import google.generativeai as genai
from config import settings

class HighlightClip(BaseModel):
    title: str
    start: float
    hook: str
    reason: str
    score: int

genai.configure(api_key=settings.GEMINI_API_KEY)

SYSTEM_PROMPT = """You are a video editor specialized in short-form content for TikTok and Instagram Reels.
Given a transcript with timestamps, identify the most engaging moments that would make great short clips.

Return ONLY a valid JSON array (no markdown, no explanation) with this structure:
[
  {
    "title": "Short punchy title",
    "start": 12.5,
    "hook": "First sentence that grabs attention",
    "reason": "Why this is engaging",
    "score": 8
  }
]

Rules:
- Score 1-10 based on virality potential
- Prefer: strong opinions, surprising facts, emotional peaks, humor, practical advice
- Minimum 3 clips, maximum 8 clips
- Avoid redundant moments
- start = timestamp where the clip should begin (seconds)"""

VARIATION_NOTE = "\n\nIMPORTANT: Generate DIFFERENT moments than you would normally pick. Explore underrated, surprising, or unconventional moments that most editors would overlook."


def _build_prompt(transcript_text: str, segments: list, max_clips: int, variation: bool) -> str:
    segment_text = "\n".join(
        [f"[{s['start']:.1f}s] {s['text']}" for s in segments]
    )
    extra = VARIATION_NOTE if variation else ""
    return f"""Analyze this transcript and find the {max_clips} best viral moments.{extra}

TRANSCRIPT:
{transcript_text}

SEGMENTS WITH TIMESTAMPS:
{segment_text}

Return top {max_clips} moments as JSON array."""


def analyze_with_gemini(transcript: dict, max_clips: int, variation: bool, api_key: str = None) -> list:
    eff_key = api_key if api_key else settings.GEMINI_API_KEY
    genai.configure(api_key=eff_key)
    
    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=SYSTEM_PROMPT,
    )
    prompt = _build_prompt(transcript["full_text"], transcript["segments"], max_clips, variation)
    import time
    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = model.generate_content(
                prompt,
                generation_config={
                    "response_mime_type": "application/json",
                    "response_schema": List[HighlightClip],
                    "temperature": 1.0 if variation else 0.7
                }
            )
            break
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(3)
            else:
                raise e
    raw = response.text.strip()
    return json.loads(raw)


def analyze_with_openai(
    transcript: dict,
    max_clips: int,
    variation: bool,
    api_key: str = None,
    base_url: str = None,
    chat_model: str = None
) -> list:
    eff_key = api_key if api_key else settings.OPENAI_API_KEY
    eff_base = base_url if base_url else settings.OPENAI_BASE_URL
    eff_model = chat_model if chat_model else settings.OPENAI_CHAT_MODEL

    client = openai.OpenAI(
        api_key=eff_key,
        base_url=eff_base if eff_base else None
    )
    prompt = _build_prompt(transcript["full_text"], transcript["segments"], max_clips, variation)
    response = client.chat.completions.create(
        model=eff_model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.9 if variation else 0.7,
    )
    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    parsed = json.loads(raw.strip())
    if isinstance(parsed, list):
        return parsed
    return parsed.get("clips", list(parsed.values())[0])


def find_highlights(
    transcript: dict,
    provider: str = "gemini",
    max_clips: int = 5,
    variation: bool = False,
    gemini_api_key: str = None,
    openai_api_key: str = None,
    openai_base_url: str = None,
    openai_chat_model: str = None,
) -> list:
    eff_openai_base = openai_base_url if openai_base_url else settings.OPENAI_BASE_URL
    is_custom_openai = eff_openai_base != "" and "api.openai.com" not in eff_openai_base
    
    if provider == "openai" or is_custom_openai:
        moments = analyze_with_openai(
            transcript, max_clips, variation,
            api_key=openai_api_key, base_url=openai_base_url, chat_model=openai_chat_model
        )
    else:
        moments = analyze_with_gemini(transcript, max_clips, variation, api_key=gemini_api_key)
    return sorted(moments, key=lambda x: x.get("score", 0), reverse=True)
