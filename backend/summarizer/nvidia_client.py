"""
Unified dual-provider AI client supporting NVIDIA NIM and Lightning AI.
All models use medical-focused prompts for the Airport Health Intelligence System.
"""
import os
import time
import json
import requests as http_requests
from typing import List, Dict, Optional, Any
from backend.api.jobs import jobs_db

# ───────────────────────────────────────────────────────
# Model Registry — NVIDIA NIM + Lightning AI
# ───────────────────────────────────────────────────────

MODELS = {
    # ── Lightning AI Models ──
    "gpt-5-nano": {
        "model_id": "openai/gpt-5-nano",
        "provider": "lightning",
        "label": "GPT-5 Nano",
        "description": "Fast & lightweight",
    },
    "gpt-oss-20b": {
        "model_id": "lightning-ai/gpt-oss-20b",
        "provider": "lightning",
        "label": "GPT-OSS 20B",
        "description": "Open-source, fast",
    },
    "gpt-oss-120b": {
        "model_id": "lightning-ai/gpt-oss-120b",
        "provider": "lightning",
        "label": "GPT-OSS 120B",
        "description": "Powerful open-source",
    },
    "gemini-flash-lite": {
        "model_id": "google/gemini-2.5-flash-lite-preview-06-17",
        "provider": "lightning",
        "label": "Gemini 2.5 Flash Lite",
        "description": "Google's fast model",
    },
    "gemma-4-31b": {
        "model_id": "lightning-ai/gemma-4-31B-it",
        "provider": "lightning",
        "label": "Gemma 4 31B",
        "description": "Google Gemma",
    },
    "gemini-3-flash-lite": {
        "model_id": "google/gemini-3.1-flash-lite-preview",
        "provider": "lightning",
        "label": "Gemini 3.1 Flash Lite",
        "description": "Newest Gemini",
    },
    "gpt-5.4-nano": {
        "model_id": "openai/gpt-5.4-nano-2026-03-17",
        "provider": "lightning",
        "label": "GPT-5.4 Nano",
        "description": "Latest GPT nano",
    },
    # ── NVIDIA NIM Models ──
    "nemotron-super": {
        "model_id": "nvidia/nemotron-3-super-120b-a12b",
        "provider": "nvidia",
        "label": "Nemotron Super 120B",
        "description": "NVIDIA's powerful model",
    },
    "nemotron-nano": {
        "model_id": "nvidia/nemotron-3-nano-30b-a3b",
        "provider": "nvidia",
        "label": "Nemotron Nano 30B",
        "description": "NVIDIA lightweight",
    },
}

DEFAULT_MODEL_KEY = "gemini-flash-lite"

# ───────────────────────────────────────────────────────
# Medical Prompts — Airport Health Intelligence
# ───────────────────────────────────────────────────────

MOLSYS_IDENTITY = (
    "You are Molsys AI, an Airport Health Intelligence System developed by Molsys Ltd, India. "
    "Molsys Ltd is a startup in Mangalore focused on Smart Electronic Health Records and airport health screening. "
    "You assist airport health staff and travelers with medical report analysis, risk assessment, and health monitoring."
)

SYSTEM_PROMPT = (
    f"{MOLSYS_IDENTITY} You excel at medical document analysis, health risk assessment, clinical summarization, "
    "and traveler health screening. "
    "Respond in well-structured markdown. Be thorough but concise. "
    "Use headings, bullet points, code blocks, and tables when they help clarity. "
    "If the user shares medical information, actively analyze it and suggest relevant follow-ups. "
    "If something seems medically significant, flag it clearly."
)

PDF_CONTEXT_PROMPT = (
    "The user has uploaded a medical PDF document. The extracted text content is provided below. "
    "Analyze this medical document thoroughly. If you find medically significant information, "
    "flag it clearly and suggest if it should be added to the patient's record.\n\n"
    "--- DOCUMENT CONTENT ---\n{doc_text}\n--- END DOCUMENT CONTENT ---"
)

MEDICAL_EXTRACTION_PROMPT = """You are a medical data extraction system for an Airport Health Intelligence platform.

Extract ALL medical information from the provided document text. Return ONLY valid JSON.

Required JSON Schema:
{
  "patient_name": null,
  "age": null,
  "gender": null,
  "travel_and_exposure": {
    "high_risk_transit_21_days": null,
    "contact_with_sick_individuals": null,
    "attended_healthcare_facility_abroad": null
  },
  "real_time_iot_vitals": {
    "heart_rate_bpm": null,
    "spo2_percentage": null,
    "respiratory_rate_bpm": null,
    "temperature_celsius": null,
    "systolic_bp": null,
    "diastolic_bp": null
  },
  "active_symptoms": {
    "sudden_fever": null,
    "unexplained_bleeding_or_bruising": null,
    "severe_fatigue_or_weakness": null,
    "gastrointestinal_distress": null,
    "palpitations_or_panic": null
  },
  "critical_lab_markers": {
    "platelet_count": null,
    "wbc_count": null,
    "ast_alt_liver_enzymes": null,
    "creatinine_kidney": null,
    "crp_inflammation": null
  },
  "underlying_vulnerabilities": {
    "diabetes_uncontrolled": null,
    "hypertension": null,
    "immunosuppressed": null
  }
}

STRICT RULES:
1. Extract ONLY information explicitly present in the document.
2. Do NOT infer or fabricate any data. Use `null` if the data is not explicitly present.
3. Aggressively hunt for the critical lab markers (Platelets, WBC, AST/ALT, Creatinine, CRP) in uploaded PDFs and convert boolean flags based on text evidence where appropriate.
4. Convert text evidence of symptoms to true/false booleans. 
5. Return ONLY the JSON object, wrapped in a ```json codeblock.
"""

CLINICAL_SUMMARY_PROMPT = """You are a clinical summarization system for an Airport Health Intelligence platform.

Generate a structured clinical summary from the provided medical data.

Format:
# Clinical Summary

## Patient Information
[Demographics if available]

## Current Conditions
[List all diagnosed conditions]

## Important Findings
[Key medical findings]

## Abnormal Values
[All abnormal lab results with values and units]

## Medications
[Current medications]

## Risk Factors
[Identified risk factors]

## Potential Risks
[Based on conditions and findings]

## Follow-up Requirements
[Recommended actions]

RULES:
- Keep clinically accurate
- Do NOT fabricate information
- Preserve all numerical values exactly
- Flag anything requiring urgent attention
- Be concise but thorough"""

AIRPORT_SUMMARY_PROMPT = """You are generating a brief Airport Screening Summary for health staff.
Airport staff need QUICK, actionable information. Keep it SHORT.

Format:
# Airport Screening Summary

**Risk Level:** [LOW/MODERATE/HIGH/CRITICAL]

**Key Findings:**
- [Finding 1]
- [Finding 2]

**Conditions:**
- [Condition 1]

**Action:**
[What airport staff should do - one clear recommendation]

**Travel Advisory:**
[Clear/Restricted/Not Recommended]

RULES:
- Maximum 150 words
- Be direct and actionable
- Use risk level from the data provided
- Focus on travel-relevant findings only"""

QUESTIONNAIRE_SYSTEM_PROMPT = """You are Molsys AI, an airport triage agent at an airport health checkpoint.

Your job is to conduct a brief health screening questionnaire with the traveler through a natural conversation.

You must ask about these topics ONE AT A TIME in a friendly, conversational manner:
1. 21-day travel history (specifically transit through high-risk areas)
2. Contact with sick individuals
3. Sudden fever or severe fatigue
4. Unexplained bleeding or gastrointestinal distress
5. IoT vitals (Ask them to provide SPO2 or Heart rate if they have a smartwatch)
6. Palpitations or panic symptoms

RULES:
- Ask ONE question at a time.
- Be friendly and reassuring.
- If the user reports concerning symptoms, express appropriate concern.
- After gathering all responses, summarize the findings.
- When all questions are answered, end with: [QUESTIONNAIRE_COMPLETE]
- CRITICAL: At the end of EVERY SINGLE MESSAGE you send, you MUST include a JSON block wrapped in ```json and ``` containing the traveler's current symptoms based on all their answers so far. Track the data exactly matching this schema:
{
  "travel_and_exposure": {"high_risk_transit_21_days": null, "contact_with_sick_individuals": null, "attended_healthcare_facility_abroad": null},
  "real_time_iot_vitals": {"heart_rate_bpm": null, "spo2_percentage": null, "respiratory_rate_bpm": null, "temperature_celsius": null, "systolic_bp": null, "diastolic_bp": null},
  "active_symptoms": {"sudden_fever": null, "unexplained_bleeding_or_bruising": null, "severe_fatigue_or_weakness": null, "gastrointestinal_distress": null, "palpitations_or_panic": null},
  "critical_lab_markers": {"platelet_count": null, "wbc_count": null, "ast_alt_liver_enzymes": null, "creatinine_kidney": null, "crp_inflammation": null},
  "underlying_vulnerabilities": {"diabetes_uncontrolled": null, "hypertension": null, "immunosuppressed": null}
}
Do this from the very first message! Use `null` if the data is not known yet. Use `true` or `false` based on user answers. Mark numerical values for vitals if provided.

IMPORTANT: Track what you've already asked. Don't repeat questions."""


# ───────────────────────────────────────────────────────
# Provider Clients
# ───────────────────────────────────────────────────────

def _get_nvidia_client(api_key: str):
    """Build an OpenAI client pointed at NVIDIA NIM."""
    from openai import OpenAI
    return OpenAI(base_url="https://integrate.api.nvidia.com/v1", api_key=api_key)


def _call_lightning(model_id: str, messages: List[Dict], temperature: float = 0.05, max_tokens: int = 8192) -> str:
    """Call Lightning AI API using the specific user requested format."""
    api_key = "136d6861-72e7-4eb5-ba55-c7b04a21937b"

    url = "https://lightning.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    
    # Format messages to match { "type": "text", "text": content }
    formatted_messages = []
    for m in messages:
        if isinstance(m.get("content"), str):
            formatted_messages.append({
                "role": m["role"],
                "content": [{"type": "text", "text": m["content"]}]
            })
        else:
            formatted_messages.append(m)

    payload = {
        "model": model_id,
        "messages": formatted_messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    response = http_requests.post(
        url=url,
        headers=headers,
        data=json.dumps(payload),
        timeout=120
    )
    
    data = json.loads(response.content)

    # Handle standard OpenAI response format as requested
    if "choices" in data:
        return data["choices"][0]["message"]["content"]
    elif "error" in data:
        raise Exception(f"Lightning AI error: {data['error']}")
    else:
        raise Exception(f"Unexpected Lightning AI response: {json.dumps(data)[:200]}")


def _call_nvidia(model_id: str, api_key: str, messages: List[Dict], temperature: float = 0.05, max_tokens: int = 8192) -> str:
    """Call NVIDIA NIM API using OpenAI SDK."""
    client = _get_nvidia_client(api_key)
    response = client.chat.completions.create(
        model=model_id,
        messages=messages,
        temperature=temperature,
        top_p=0.99,
        max_tokens=max_tokens,
    )
    return response.choices[0].message.content or ""


# ───────────────────────────────────────────────────────
# Unified API Call
# ───────────────────────────────────────────────────────

def call_model(model_key: str, messages: List[Dict], temperature: float = 0.05, max_tokens: int = 8192) -> str:
    """Unified call to any model regardless of provider."""
    cfg = MODELS.get(model_key, MODELS[DEFAULT_MODEL_KEY])
    provider = cfg["provider"]
    model_id = cfg["model_id"]

    if provider == "lightning":
        return _call_lightning(model_id, messages, temperature, max_tokens)
    elif provider == "nvidia":
        api_key = os.environ.get("NVIDIA_API_KEY", "")
        if not api_key:
            raise ValueError("NVIDIA_API_KEY is not set in environment")
        return _call_nvidia(model_id, api_key, messages, temperature, max_tokens)
    else:
        raise ValueError(f"Unknown provider: {provider}")


# ───────────────────────────────────────────────────────
# Helpers
# ───────────────────────────────────────────────────────

def get_models_for_frontend() -> list:
    """Return model list for frontend display."""
    return [
        {
            "key": k,
            "label": v["label"],
            "model_id": v["model_id"],
            "provider": v["provider"],
            "description": v.get("description", ""),
        }
        for k, v in MODELS.items()
    ]


def _get_model_id(model_key: str) -> str:
    return MODELS.get(model_key, MODELS[DEFAULT_MODEL_KEY])["model_id"]


# ───────────────────────────────────────────────────────
# Chat Engine
# ───────────────────────────────────────────────────────

class ChatEngine:
    """Handles multi-turn chat with retry logic."""

    def __init__(self):
        self.max_retries = 3
        self.base_backoff = 2

    def _split_into_chunks(self, text: str, max_tokens: int = 5000) -> List[str]:
        chars_per_token = 4
        chunk_size = max_tokens * chars_per_token
        return [text[i:i + chunk_size] for i in range(0, len(text), chunk_size)]

    def _make_api_call(self, model_key: str, api_messages: List[Dict[str, str]], temperature: float = 0.05) -> str:
        for attempt in range(self.max_retries):
            try:
                return call_model(model_key, api_messages, temperature)
            except Exception as e:
                if attempt == self.max_retries - 1:
                    return f"Error: API request failed after {self.max_retries} attempts. ({str(e)})"
                time.sleep(self.base_backoff ** attempt)
        return "Error: Failed to get response from AI model."

    def chat(
        self,
        messages: List[Dict[str, str]],
        model_key: str = DEFAULT_MODEL_KEY,
        pdf_context: Optional[str] = None,
        mode: str = "chat",
    ) -> str:
        if mode == "extract":
            system_prompt = MEDICAL_EXTRACTION_PROMPT
        elif mode == "questionnaire":
            system_prompt = QUESTIONNAIRE_SYSTEM_PROMPT
        else:
            system_prompt = SYSTEM_PROMPT

        # Extract latest user prompt for chunked-PDF path
        user_prompt = ""
        for msg in reversed(messages):
            if msg["role"] == "user":
                user_prompt = msg["content"]
                break

        if pdf_context:
            estimated_tokens = len(pdf_context) // 4
            if estimated_tokens > 6000:
                chunks = self._split_into_chunks(pdf_context, max_tokens=5000)
                chunk_responses = []
                for chunk in chunks:
                    chunk_user_msg = (
                        f"{user_prompt}\n\n"
                        f"PDF shared by user:\n{chunk}\n"
                        f"\"\"\"\"\" pdf end \"\"\"\"\"\n\n"
                        f"Reminder of the task:\n{user_prompt}"
                    )
                    api_messages = [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": chunk_user_msg}
                    ]
                    temp = 0.0 if mode == "extract" else 0.05
                    response = self._make_api_call(model_key, api_messages, temperature=temp)
                    chunk_responses.append(response)

                if len(chunk_responses) == 1:
                    return chunk_responses[0]

                if mode == "extract":
                    extracted_jsons = []
                    for idx, res in enumerate(chunk_responses):
                        extracted_jsons.append(_parse_json_response(res))
                    merged = _merge_extraction_jsons(extracted_jsons)
                    return json.dumps(merged, indent=2)
                else:
                    merge_prompt = (
                        "I asked a question about a large document, which was split into parts. "
                        "Here are your answers for each part:\n\n"
                    )
                    for idx, ans in enumerate(chunk_responses):
                        merge_prompt += f"--- Part {idx+1} ---\n{ans}\n\n"
                    merge_prompt += f"Please synthesize these into a single, cohesive final answer to the original task: '{user_prompt}'"

                    api_messages = [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": merge_prompt}
                    ]
                    return self._make_api_call(model_key, api_messages)
            else:
                system_prompt += "\n\n" + PDF_CONTEXT_PROMPT.format(doc_text=pdf_context)

        api_messages = [{"role": "system", "content": system_prompt}]
        recent = messages[-20:] if len(messages) > 20 else messages
        for msg in recent:
            api_messages.append({
                "role": msg["role"],
                "content": msg["content"],
            })

        return self._make_api_call(model_key, api_messages)


# ───────────────────────────────────────────────────────
# Medical Extraction Helpers
# ───────────────────────────────────────────────────────

def extract_medical_json(text: str, model_key: str = DEFAULT_MODEL_KEY) -> Dict[str, Any]:
    """Extract medical data from document text, returns structured JSON."""
    engine = ChatEngine()
    messages = [{"role": "user", "content": f"Extract medical data from this document:\n\n{text}"}]
    response = engine.chat(messages, model_key=model_key, mode="extract")
    return _parse_json_response(response)


def generate_clinical_summary(medical_json: Dict[str, Any], model_key: str = DEFAULT_MODEL_KEY) -> str:
    """Generate clinical summary from medical JSON."""
    engine = ChatEngine()
    data_text = json.dumps(medical_json, indent=2)
    messages = [{"role": "user", "content": f"Generate a clinical summary from this medical data:\n\n{data_text}"}]
    
    api_messages = [
        {"role": "system", "content": CLINICAL_SUMMARY_PROMPT},
        {"role": "user", "content": f"Medical data:\n{data_text}"}
    ]
    return engine._make_api_call(model_key, api_messages)


def generate_airport_summary(medical_json: Dict[str, Any], risk_data: Dict[str, Any], model_key: str = DEFAULT_MODEL_KEY) -> str:
    """Generate airport screening summary."""
    engine = ChatEngine()
    combined = {
        "medical_data": medical_json,
        "risk_assessment": risk_data,
    }
    data_text = json.dumps(combined, indent=2)
    
    api_messages = [
        {"role": "system", "content": AIRPORT_SUMMARY_PROMPT},
        {"role": "user", "content": f"Generate an airport screening summary:\n{data_text}"}
    ]
    return engine._make_api_call(model_key, api_messages)


# ───────────────────────────────────────────────────────
# JSON Parsing & Merging
# ───────────────────────────────────────────────────────

def _parse_json_response(response: str) -> Dict[str, Any]:
    """Parse JSON from LLM response, handling code blocks."""
    text = response.strip()
    
    # Remove markdown code blocks
    if "```json" in text:
        text = text.split("```json", 1)[1]
        if "```" in text:
            text = text.split("```", 1)[0]
    elif "```" in text:
        parts = text.split("```")
        if len(parts) >= 3:
            text = parts[1]
        elif len(parts) >= 2:
            text = parts[1] if parts[1].strip().startswith("{") else parts[0]

    text = text.strip()
    
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to find JSON object in the text
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
            try:
                return json.loads(text[start:end+1])
            except json.JSONDecodeError:
                pass
    
    # Return empty structure matching the new schema
    return {
        "patient_name": None,
        "age": None,
        "gender": None,
        "travel_and_exposure": {
            "high_risk_transit_21_days": None,
            "contact_with_sick_individuals": None,
            "attended_healthcare_facility_abroad": None
        },
        "real_time_iot_vitals": {
            "heart_rate_bpm": None,
            "spo2_percentage": None,
            "respiratory_rate_bpm": None,
            "temperature_celsius": None,
            "systolic_bp": None,
            "diastolic_bp": None
        },
        "active_symptoms": {
            "sudden_fever": None,
            "unexplained_bleeding_or_bruising": None,
            "severe_fatigue_or_weakness": None,
            "gastrointestinal_distress": None,
            "palpitations_or_panic": None
        },
        "critical_lab_markers": {
            "platelet_count": None,
            "wbc_count": None,
            "ast_alt_liver_enzymes": None,
            "creatinine_kidney": None,
            "crp_inflammation": None
        },
        "underlying_vulnerabilities": {
            "diabetes_uncontrolled": None,
            "hypertension": None,
            "immunosuppressed": None
        }
    }


def _merge_extraction_jsons(jsons: List[Dict]) -> Dict[str, Any]:
    """Merge multiple extraction JSONs from chunked processing using the new nested schema."""
    from backend.api.patient_store import _merge_extractions
    
    merged = {
        "patient_name": None,
        "age": None,
        "gender": None,
        "travel_and_exposure": {},
        "real_time_iot_vitals": {},
        "active_symptoms": {},
        "critical_lab_markers": {},
        "underlying_vulnerabilities": {}
    }

    for j in jsons:
        if not isinstance(j, dict):
            continue
        merged = _merge_extractions(merged, j)

    return merged


# ───────────────────────────────────────────────────────
# Legacy Summarizer (kept for pipeline compatibility)
# ───────────────────────────────────────────────────────

STYLE_PROMPTS = {
    "Quick": """STYLE: QUICK SUMMARY
Provide a brief overview of the medical document:
# Document Type
# Key Findings
# Important Values
# Recommendations

Keep it structured with an executive summary paragraph then bullet points.""",

    "Detailed": """STYLE: DETAILED SUMMARY
Provide a comprehensive analysis:
# Document Type
# Patient Information
# All Findings (with exact values)
# Lab Results Table
# Medications
# Diagnoses
# Recommendations

Include all numerical values exactly as they appear.""",

    "Clinical": """STYLE: CLINICAL REPORT
Format as clinical notes:
# Clinical Summary
# Patient Demographics
# Chief Complaint
# Findings
# Assessment
# Plan

Use clinical shorthand and bullet points for fast reading.""",
}


class APISummarizer:
    """PDF summarization pipeline — now using the unified model client."""

    def __init__(self, output_dir: str):
        self.output_dir = output_dir
        self.max_retries = 5
        self.base_backoff = 2

    def _update_job(self, job_id: str, stage: str, progress: float, status: str):
        if job_id in jobs_db:
            jobs_db[job_id]["stage"] = stage
            jobs_db[job_id]["progress"] = progress
            jobs_db[job_id]["status"] = status

    def summarize(
        self,
        chunks,
        filename: str,
        style: str,
        length_pages: int,
        job_id: str,
        document_type: str = "Medical Report",
        model_key: str = DEFAULT_MODEL_KEY,
    ) -> str:
        min_tokens = length_pages * 1000
        max_tokens = min_tokens + 500

        self._update_job(job_id, "Extracting", 10.0, "Starting extraction...")

        # Combine all chunk text
        full_text = "\n\n".join(c.text for c in chunks)

        # Stage 1: Medical Extraction
        self._update_job(job_id, "Extracting", 30.0, "Extracting medical data...")
        medical_json = extract_medical_json(full_text, model_key)

        # Stage 2: Generate Summary
        self._update_job(job_id, "Summarizing", 60.0, "Generating summary...")

        style_prompt = STYLE_PROMPTS.get(style, STYLE_PROMPTS["Quick"])
        data_text = json.dumps(medical_json, indent=2)

        summary_prompt = (
            f"{style_prompt}\n\n"
            f"Medical data extracted:\n{data_text}\n\n"
            f"Original document text (for reference):\n{full_text[:5000]}\n\n"
            f"TARGET LENGTH: approximately {min_tokens}-{max_tokens} tokens."
        )

        engine = ChatEngine()
        api_messages = [
            {"role": "system", "content": CLINICAL_SUMMARY_PROMPT},
            {"role": "user", "content": summary_prompt},
        ]
        result = engine._make_api_call(model_key, api_messages)

        self._update_job(job_id, "Complete", 100.0, "Summary completed.")
        return result
