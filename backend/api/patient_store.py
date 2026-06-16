"""
Per-patient folder-based storage system.
Each patient gets a structured directory hierarchy under data/patients/{username}/.
"""
import os
import json
import uuid
import shutil
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
PATIENTS_DIR = os.path.join(DATA_DIR, "patients")
os.makedirs(PATIENTS_DIR, exist_ok=True)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_patient_dir(username: str) -> str:
    return os.path.join(PATIENTS_DIR, username)


def create_patient_dir(username: str):
    """Create the full patient folder hierarchy."""
    base = get_patient_dir(username)
    subdirs = ["uploads", "extracted", "chunks", "summaries", "questionnaire", "risk", "chats", "timeline"]
    for sub in subdirs:
        os.makedirs(os.path.join(base, sub), exist_ok=True)

    # Create initial profile
    profile_path = os.path.join(base, "profile.json")
    if not os.path.exists(profile_path):
        profile = {
            "username": username,
            "created_at": _now(),
            "conditions": [],
            "medications": [],
            "last_risk_score": None,
            "last_risk_level": None,
        }
        with open(profile_path, "w", encoding="utf-8") as f:
            json.dump(profile, f, ensure_ascii=False, indent=2)

    # Create initial timeline
    timeline_path = os.path.join(base, "timeline", "timeline.json")
    if not os.path.exists(timeline_path):
        with open(timeline_path, "w", encoding="utf-8") as f:
            json.dump([], f)


# ── Profile ──

def get_profile(username: str) -> Optional[Dict[str, Any]]:
    path = os.path.join(get_patient_dir(username), "profile.json")
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_profile(username: str, profile: Dict[str, Any]):
    path = os.path.join(get_patient_dir(username), "profile.json")
    profile["updated_at"] = _now()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(profile, f, ensure_ascii=False, indent=2)


def update_profile_from_extraction(username: str, extraction: Dict[str, Any]):
    """Update patient profile with extracted medical data safely."""
    profile = get_profile(username) or {}
    
    # Safely extract conditions from underlying vulnerabilities
    existing_conditions = set(profile.get("conditions", []))
    new_conditions = []
    vulns = extraction.get("underlying_vulnerabilities", {})
    if vulns:
        for k, v in vulns.items():
            if v is True or str(v).lower() in ['true', 'yes', '1']:
                new_conditions.append(k.replace('_', ' ').title())
    profile["conditions"] = sorted(existing_conditions | set(new_conditions))

    # Safely extract symptoms from active symptoms
    existing_symptoms = set(profile.get("symptoms", []))
    new_symptoms = []
    symps = extraction.get("active_symptoms", {})
    if symps:
        for k, v in symps.items():
            if v is True or str(v).lower() in ['true', 'yes', '1']:
                new_symptoms.append(k.replace('_', ' ').title())
    profile["symptoms"] = sorted(existing_symptoms | set(new_symptoms))

    # Medications are no longer tracked explicitly in the schema, just keep existing
    if "medications" not in profile:
        profile["medications"] = []

    # Update patient info if available
    if extraction.get("patient_name"):
        profile["patient_name"] = extraction["patient_name"]
    if extraction.get("age"):
        profile["age"] = extraction["age"]
    if extraction.get("gender"):
        profile["gender"] = extraction["gender"]

    save_profile(username, profile)


# ── Uploads ──

def save_upload(username: str, pdf_bytes: bytes, original_filename: str) -> str:
    """Save uploaded PDF. Returns file_id."""
    file_id = str(uuid.uuid4())
    uploads_dir = os.path.join(get_patient_dir(username), "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    
    filepath = os.path.join(uploads_dir, f"{file_id}.pdf")
    with open(filepath, "wb") as f:
        f.write(pdf_bytes)

    # Save upload metadata
    meta_path = os.path.join(uploads_dir, f"{file_id}_meta.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump({
            "file_id": file_id,
            "original_filename": original_filename,
            "uploaded_at": _now(),
            "size_bytes": len(pdf_bytes),
        }, f, ensure_ascii=False, indent=2)

    return file_id


def get_upload_path(username: str, file_id: str) -> Optional[str]:
    path = os.path.join(get_patient_dir(username), "uploads", f"{file_id}.pdf")
    return path if os.path.exists(path) else None


def list_uploads(username: str) -> List[Dict[str, Any]]:
    uploads_dir = os.path.join(get_patient_dir(username), "uploads")
    if not os.path.exists(uploads_dir):
        return []
    uploads = []
    for f in os.listdir(uploads_dir):
        if f.endswith("_meta.json"):
            with open(os.path.join(uploads_dir, f), "r", encoding="utf-8") as fh:
                uploads.append(json.load(fh))
    uploads.sort(key=lambda x: x.get("uploaded_at", ""), reverse=True)
    return uploads


# ── Extractions ──

def save_extraction(username: str, extraction_json: Dict[str, Any], file_id: str = None):
    """Save medical extraction JSON and generate readable MD."""
    extracted_dir = os.path.join(get_patient_dir(username), "extracted")
    os.makedirs(extracted_dir, exist_ok=True)

    # Save JSON
    json_path = os.path.join(extracted_dir, "extraction.json")
    # Merge with existing if present
    existing = {}
    if os.path.exists(json_path):
        with open(json_path, "r", encoding="utf-8") as f:
            existing = json.load(f)

    # Merge intelligently
    merged = _merge_extractions(existing, extraction_json)
    merged["last_updated"] = _now()
    if file_id:
        sources = merged.get("source_files", [])
        if file_id not in sources:
            sources.append(file_id)
        merged["source_files"] = sources

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)

    # Generate MD
    md_content = _extraction_to_md(merged)
    md_path = os.path.join(extracted_dir, "extracted.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_content)

    # Also save per-file extraction
    if file_id:
        per_file_path = os.path.join(extracted_dir, f"extraction_{file_id}.json")
        with open(per_file_path, "w", encoding="utf-8") as f:
            json.dump(extraction_json, f, ensure_ascii=False, indent=2)


def get_extraction(username: str) -> Optional[Dict[str, Any]]:
    path = os.path.join(get_patient_dir(username), "extracted", "extraction.json")
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _merge_extractions(existing: Dict, new: Dict) -> Dict:
    """Merge two extraction JSONs using the new nested schema."""
    merged = {}
    
    # Simple top level keys
    for key in ["patient_name", "age", "gender"]:
        merged[key] = new.get(key) or existing.get(key)

    # Schema keys
    schema_keys = [
        "travel_and_exposure",
        "real_time_iot_vitals",
        "active_symptoms",
        "critical_lab_markers",
        "underlying_vulnerabilities"
    ]
    
    for key in schema_keys:
        merged[key] = {}
        old_obj = existing.get(key, {}) or {}
        new_obj = new.get(key, {}) or {}
        
        # Merge all sub-keys
        all_subkeys = set(old_obj.keys()) | set(new_obj.keys())
        for subkey in all_subkeys:
            old_val = old_obj.get(subkey)
            new_val = new_obj.get(subkey)
            
            # If the value is boolean-like, use logical OR
            if key in ["travel_and_exposure", "active_symptoms", "underlying_vulnerabilities"]:
                def _is_true(v):
                    return v is True or str(v).lower() in ['true', 'yes', '1']
                merged[key][subkey] = _is_true(old_val) or _is_true(new_val)
            else:
                # For numbers (vitals, labs), prefer the new value if it's not null, else keep old
                if new_val is not None:
                    merged[key][subkey] = new_val
                else:
                    merged[key][subkey] = old_val

    # Keep source files
    merged["source_files"] = existing.get("source_files", [])

    return merged


def _extraction_to_md(extraction: Dict) -> str:
    """Convert extraction JSON to readable markdown."""
    lines = ["# Medical Extraction Report\n"]

    if extraction.get("patient_name"):
        lines.append(f"**Patient:** {extraction['patient_name']}")
    if extraction.get("age"):
        lines.append(f"**Age:** {extraction['age']}")
    if extraction.get("gender"):
        lines.append(f"**Gender:** {extraction['gender']}")
    lines.append("")

    sections = {
        "travel_and_exposure": "Travel & Exposure",
        "real_time_iot_vitals": "Real-time IoT Vitals",
        "active_symptoms": "Active Symptoms",
        "critical_lab_markers": "Critical Lab Markers",
        "underlying_vulnerabilities": "Underlying Vulnerabilities"
    }

    for key, title in sections.items():
        obj = extraction.get(key, {})
        if obj and any(v is not None for v in obj.values()):
            lines.append(f"## {title}")
            for k, v in obj.items():
                if v is not None and v is not False:  # Hide false booleans to reduce noise
                    val_str = "Yes" if v is True else str(v)
                    lines.append(f"- **{k.replace('_', ' ').title()}**: {val_str}")
            lines.append("")

    lines.append(f"\n*Last updated: {extraction.get('last_updated', 'Unknown')}*")
    return "\n".join(lines)


# ── Summaries ──

def save_summary(username: str, summary_type: str, content: str, file_id: str = None):
    """Save a summary file. summary_type: 'clinical', 'airport', or 'pdf_{file_id}'."""
    summaries_dir = os.path.join(get_patient_dir(username), "summaries")
    os.makedirs(summaries_dir, exist_ok=True)

    filename = f"summary_{summary_type}.md"
    if file_id:
        filename = f"summary_{summary_type}_{file_id}.md"
    
    filepath = os.path.join(summaries_dir, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)


def get_summary(username: str, summary_type: str) -> Optional[str]:
    summaries_dir = os.path.join(get_patient_dir(username), "summaries")
    filepath = os.path.join(summaries_dir, f"summary_{summary_type}.md")
    if not os.path.exists(filepath):
        return None
    with open(filepath, "r", encoding="utf-8") as f:
        return f.read()


def list_summaries(username: str) -> List[Dict[str, Any]]:
    summaries_dir = os.path.join(get_patient_dir(username), "summaries")
    if not os.path.exists(summaries_dir):
        return []
    result = []
    for f in sorted(os.listdir(summaries_dir)):
        if f.endswith(".md"):
            filepath = os.path.join(summaries_dir, f)
            result.append({
                "filename": f,
                "size_bytes": os.path.getsize(filepath),
                "modified_at": datetime.fromtimestamp(os.path.getmtime(filepath), tz=timezone.utc).isoformat(),
            })
    return result


# ── Risk ──

def save_risk(username: str, risk_data: Dict[str, Any]):
    risk_dir = os.path.join(get_patient_dir(username), "risk")
    os.makedirs(risk_dir, exist_ok=True)
    risk_data["calculated_at"] = _now()

    filepath = os.path.join(risk_dir, "risk_report.json")
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(risk_data, f, ensure_ascii=False, indent=2)

    # Update profile with latest risk
    profile = get_profile(username)
    if profile:
        profile["last_risk_score"] = risk_data.get("risk_score")
        profile["last_risk_level"] = risk_data.get("risk_level")
        save_profile(username, profile)


def get_risk(username: str) -> Optional[Dict[str, Any]]:
    filepath = os.path.join(get_patient_dir(username), "risk", "risk_report.json")
    if not os.path.exists(filepath):
        return None
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


# ── Questionnaire ──

def save_questionnaire(username: str, responses: Dict[str, Any]):
    q_dir = os.path.join(get_patient_dir(username), "questionnaire")
    os.makedirs(q_dir, exist_ok=True)
    responses["completed_at"] = _now()

    filepath = os.path.join(q_dir, "responses.json")
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(responses, f, ensure_ascii=False, indent=2)


def get_questionnaire(username: str) -> Optional[Dict[str, Any]]:
    filepath = os.path.join(get_patient_dir(username), "questionnaire", "responses.json")
    if not os.path.exists(filepath):
        return None
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


# ── Chats ──

def save_chat(username: str, chat_id: str, chat_data: Dict[str, Any]):
    chats_dir = os.path.join(get_patient_dir(username), "chats")
    os.makedirs(chats_dir, exist_ok=True)
    chat_data["updated_at"] = _now()

    filepath = os.path.join(chats_dir, f"{chat_id}.json")
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(chat_data, f, ensure_ascii=False, indent=2)


def get_chat(username: str, chat_id: str) -> Optional[Dict[str, Any]]:
    filepath = os.path.join(get_patient_dir(username), "chats", f"{chat_id}.json")
    if not os.path.exists(filepath):
        return None
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def list_chats(username: str) -> List[Dict[str, Any]]:
    chats_dir = os.path.join(get_patient_dir(username), "chats")
    if not os.path.exists(chats_dir):
        return []
    chats = []
    for f in os.listdir(chats_dir):
        if not f.endswith(".json"):
            continue
        try:
            with open(os.path.join(chats_dir, f), "r", encoding="utf-8") as fh:
                chat = json.load(fh)
            preview = ""
            if chat.get("messages"):
                last = chat["messages"][-1]
                preview = last.get("content", "")[:80]
            chats.append({
                "id": chat["id"],
                "title": chat.get("title", "Untitled"),
                "model": chat.get("model", ""),
                "updated_at": chat.get("updated_at", ""),
                "preview": preview,
                "message_count": len(chat.get("messages", [])),
            })
        except (json.JSONDecodeError, KeyError):
            continue
    chats.sort(key=lambda c: c.get("updated_at", ""), reverse=True)
    return chats


def delete_chat(username: str, chat_id: str) -> bool:
    filepath = os.path.join(get_patient_dir(username), "chats", f"{chat_id}.json")
    if os.path.exists(filepath):
        os.remove(filepath)
        return True
    return False


# ── Timeline ──

def add_timeline_event(username: str, event_type: str, description: str, metadata: Dict = None):
    timeline_dir = os.path.join(get_patient_dir(username), "timeline")
    os.makedirs(timeline_dir, exist_ok=True)
    filepath = os.path.join(timeline_dir, "timeline.json")

    timeline = []
    if os.path.exists(filepath):
        with open(filepath, "r", encoding="utf-8") as f:
            timeline = json.load(f)

    event = {
        "timestamp": _now(),
        "type": event_type,
        "description": description,
    }
    if metadata:
        event["metadata"] = metadata

    timeline.append(event)

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(timeline, f, ensure_ascii=False, indent=2)


def get_timeline(username: str) -> List[Dict[str, Any]]:
    filepath = os.path.join(get_patient_dir(username), "timeline", "timeline.json")
    if not os.path.exists(filepath):
        return []
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


# ── Chunks ──

def save_chunks(username: str, file_id: str, chunks_data: List[Dict[str, Any]]):
    chunks_dir = os.path.join(get_patient_dir(username), "chunks")
    os.makedirs(chunks_dir, exist_ok=True)
    filepath = os.path.join(chunks_dir, f"chunks_{file_id}.json")
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(chunks_data, f, ensure_ascii=False, indent=2)


# ── Patient Overview (for dashboard) ──

def get_patient_overview(username: str) -> Dict[str, Any]:
    """Get complete patient overview for UI."""
    return {
        "username": username,
        "profile": get_profile(username),
        "risk": get_risk(username),
        "extraction": get_extraction(username),
        "summaries": list_summaries(username),
        "uploads": list_uploads(username),
        "timeline": get_timeline(username),
        "questionnaire": get_questionnaire(username),
        "chat_count": len(list_chats(username)),
    }


# ── Admin Functions ──

def list_all_patients() -> List[Dict[str, Any]]:
    """List all patients with their risk levels (for admin dashboard)."""
    patients = []
    if not os.path.exists(PATIENTS_DIR):
        return []
    for username in os.listdir(PATIENTS_DIR):
        patient_dir = os.path.join(PATIENTS_DIR, username)
        if not os.path.isdir(patient_dir):
            continue
        profile = get_profile(username)
        risk = get_risk(username)
        patients.append({
            "username": username,
            "full_name": profile.get("patient_name") or profile.get("full_name", username) if profile else username,
            "conditions": profile.get("conditions", []) if profile else [],
            "risk_score": risk.get("risk_score", 0) if risk else 0,
            "risk_level": risk.get("risk_level", "NONE") if risk else "NONE",
            "uploads_count": len(list_uploads(username)),
            "last_activity": profile.get("updated_at", profile.get("created_at", "")) if profile else "",
        })
    # Sort: CRITICAL → HIGH → MODERATE → LOW → NONE
    risk_order = {"CRITICAL": 0, "HIGH": 1, "MODERATE": 2, "LOW": 3, "NONE": 4}
    patients.sort(key=lambda p: (risk_order.get(p["risk_level"], 5), -p["risk_score"]))
    return patients


def get_admin_stats() -> Dict[str, Any]:
    """Get aggregate statistics for admin dashboard."""
    patients = list_all_patients()
    stats = {
        "total_patients": len(patients),
        "critical": sum(1 for p in patients if p["risk_level"] == "CRITICAL"),
        "high": sum(1 for p in patients if p["risk_level"] == "HIGH"),
        "moderate": sum(1 for p in patients if p["risk_level"] == "MODERATE"),
        "low": sum(1 for p in patients if p["risk_level"] == "LOW"),
        "none": sum(1 for p in patients if p["risk_level"] == "NONE"),
    }
    return stats
