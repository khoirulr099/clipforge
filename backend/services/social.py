import json
import openai
from pydantic import BaseModel
import google.generativeai as genai
from config import settings

class SocialPost(BaseModel):
    title: str
    description: str
    hashtags: str

SYSTEM_PROMPT = """You are a social media copywriter specialized in short-form video content (TikTok, Reels, Shorts).
Given a video clip transcript, write a viral hook title, a highly engaging description, and a list of relevant hashtags.

Return ONLY a valid JSON object (no markdown, no explanation) with this structure:
{
  "title": "A short, viral, clickbaity video title",
  "description": "Engaging description or post copy that makes viewers want to read and share",
  "hashtags": "#tag1 #tag2 #tag3"
}
"""

def generate_social_post(
    clip_transcript: str,
    provider: str = "gemini",
    gemini_api_key: str = None,
    openai_api_key: str = None,
    openai_base_url: str = None,
    openai_chat_model: str = None
) -> dict:
    eff_gemini_key = gemini_api_key if gemini_api_key else settings.GEMINI_API_KEY
    eff_openai_key = openai_api_key if openai_api_key else settings.OPENAI_API_KEY
    eff_openai_base = openai_base_url if openai_base_url else settings.OPENAI_BASE_URL
    eff_openai_model = openai_chat_model if openai_chat_model else settings.OPENAI_CHAT_MODEL
    
    prompt = f"Write a viral social media post (title, description, hashtags) for this video transcript:\n\n{clip_transcript}"
    
    is_custom_openai = eff_openai_base != "" and "api.openai.com" not in eff_openai_base
    
    if provider == "openai" or is_custom_openai:
        client = openai.OpenAI(
            api_key=eff_openai_key,
            base_url=eff_openai_base if eff_openai_base else None
        )
        response = client.chat.completions.create(
            model=eff_openai_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.7,
        )
        raw = response.choices[0].message.content.strip()
    else:
        genai.configure(api_key=eff_gemini_key)
        model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            system_instruction=SYSTEM_PROMPT
        )
        response = model.generate_content(
            prompt,
            generation_config={
                "response_mime_type": "application/json",
                "response_schema": SocialPost,
                "temperature": 0.7
            }
        )
        raw = response.text.strip()
        
    return json.loads(raw)
