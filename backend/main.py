"""
Molsys Airport Health Intelligence System — Main API Server
"""
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, Header, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import os
import uuid
import json

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from backend.api.jobs import jobs_db
from backend.api.auth import (
    register, login, get_current_user, is_admin, logout, list_all_users,
)
from backend.api.patient_store import (
    save_upload, get_upload_path, list_uploads,
    get_patient_overview, list_all_patients, get_admin_stats,
    save_chat, get_chat, list_chats, delete_chat,
    add_timeline_event, save_questionnaire, get_questionnaire,
    get_extraction, get_risk, get_summary, list_summaries,
    get_profile, save_profile, get_timeline, create_patient_dir,
)
from backend.summarizer.pdf_processor import PDFProcessor
from backend.summarizer.nvidia_client import (
    ChatEngine, APISummarizer, get_models_for_frontend, DEFAULT_MODEL_KEY,
)
from backend.summarizer.medical_pipeline import run_medical_pipeline, run_questionnaire_risk_update

app = FastAPI(title="Molsys Airport Health Intelligence")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "outputs")
os.makedirs(OUTPUT_DIR, exist_ok=True)

chat_engine = ChatEngine()


# ──────────────────────────────────────────────
# Auth helper
# ──────────────────────────────────────────────

def _get_user(authorization: str = None):
    """Extract user from Authorization header."""
    if not authorization:
        return None
    token = authorization.replace("Bearer ", "").strip()
    return get_current_user(token)


# ──────────────────────────────────────────────
# Auth API
# ──────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str
    password: str
    full_name: str = ""

class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/api/auth/register")
async def api_register(req: RegisterRequest):
    result = register(req.username, req.password, req.full_name)
    if "error" in result:
        return JSONResponse(status_code=400, content=result)
    return result


@app.post("/api/auth/login")
async def api_login(req: LoginRequest):
    result = login(req.username, req.password)
    if "error" in result:
        return JSONResponse(status_code=401, content=result)
    return result


@app.get("/api/auth/me")
async def api_me(authorization: str = Header(None)):
    user = _get_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})
    return user


@app.post("/api/auth/logout")
async def api_logout(authorization: str = Header(None)):
    if authorization:
        token = authorization.replace("Bearer ", "").strip()
        logout(token)
    return {"ok": True}


# ──────────────────────────────────────────────
# Models API
# ──────────────────────────────────────────────

@app.get("/api/models")
async def api_list_models():
    return get_models_for_frontend()


# ──────────────────────────────────────────────
# Upload & Pipeline API
# ──────────────────────────────────────────────

@app.post("/api/upload")
async def upload_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    model: str = Form(DEFAULT_MODEL_KEY),
    authorization: str = Header(None),
):
    user = _get_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})

    username = user["username"]
    pdf_bytes = await file.read()
    
    # Save to patient folder
    file_id = save_upload(username, pdf_bytes, file.filename)

    # Create pipeline job
    job_id = str(uuid.uuid4())
    jobs_db[job_id] = {
        "stage": "Queued",
        "progress": 0,
        "status": "Starting pipeline...",
        "result": None,
    }

    # Run pipeline in background
    background_tasks.add_task(
        _run_pipeline_task, username, file_id, model, job_id
    )

    return {
        "file_id": file_id,
        "filename": file.filename,
        "job_id": job_id,
    }


def _run_pipeline_task(username: str, file_id: str, model_key: str, job_id: str):
    """Background task wrapper for the medical pipeline."""
    result = run_medical_pipeline(username, file_id, model_key, job_id)
    if job_id in jobs_db:
        jobs_db[job_id]["result"] = result


@app.get("/api/pipeline/status/{job_id}")
async def api_pipeline_status(job_id: str):
    if job_id not in jobs_db:
        return JSONResponse(status_code=404, content={"error": "Job not found"})
    return jobs_db[job_id]


# ──────────────────────────────────────────────
# Patient Data API
# ──────────────────────────────────────────────

@app.get("/api/patient/overview")
async def api_patient_overview(authorization: str = Header(None)):
    user = _get_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})
    return get_patient_overview(user["username"])


@app.get("/api/patient/extraction")
async def api_get_extraction(authorization: str = Header(None)):
    user = _get_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})
    data = get_extraction(user["username"])
    return data or {}


@app.get("/api/patient/risk")
async def api_get_risk(authorization: str = Header(None)):
    user = _get_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})
    data = get_risk(user["username"])
    return data or {}


@app.get("/api/patient/summaries")
async def api_list_summaries(authorization: str = Header(None)):
    user = _get_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})
    return list_summaries(user["username"])


@app.get("/api/patient/summary/{summary_type}")
async def api_get_summary(summary_type: str, authorization: str = Header(None)):
    user = _get_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})
    content = get_summary(user["username"], summary_type)
    if content is None:
        return JSONResponse(status_code=404, content={"error": "Summary not found"})
    return {"type": summary_type, "content": content}


@app.get("/api/patient/uploads")
async def api_list_uploads(authorization: str = Header(None)):
    user = _get_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})
    return list_uploads(user["username"])


@app.get("/api/patient/timeline")
async def api_get_timeline(authorization: str = Header(None)):
    user = _get_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})
    return get_timeline(user["username"])


@app.get("/api/patient/profile")
async def api_get_profile(authorization: str = Header(None)):
    user = _get_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})
    return get_profile(user["username"]) or {}


# ──────────────────────────────────────────────
# Chat API
# ──────────────────────────────────────────────

class NewChatRequest(BaseModel):
    title: str = "New Chat"
    model: str = DEFAULT_MODEL_KEY

class SendMessageRequest(BaseModel):
    chat_id: str
    content: str
    model: str = DEFAULT_MODEL_KEY
    attachment: Optional[dict] = None
    mode: str = "chat"

class RenameRequest(BaseModel):
    title: str


@app.post("/api/chat/new")
async def api_new_chat(req: NewChatRequest, authorization: str = Header(None)):
    user = _get_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})

    chat_id = str(uuid.uuid4())
    chat = {
        "id": chat_id,
        "title": req.title,
        "model": req.model,
        "created_at": _now(),
        "updated_at": _now(),
        "messages": [],
        "attachments": [],
    }
    save_chat(user["username"], chat_id, chat)
    return chat


@app.get("/api/chats")
async def api_list_chats(authorization: str = Header(None)):
    user = _get_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})
    return list_chats(user["username"])


@app.get("/api/chat/{chat_id}")
async def api_get_chat(chat_id: str, authorization: str = Header(None)):
    user = _get_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})
    chat = get_chat(user["username"], chat_id)
    if not chat:
        return JSONResponse(status_code=404, content={"error": "Chat not found"})
    return chat


@app.post("/api/chat")
async def api_send_message(req: SendMessageRequest, authorization: str = Header(None)):
    user = _get_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})

    username = user["username"]
    chat = get_chat(username, req.chat_id)
    if not chat:
        return JSONResponse(status_code=404, content={"error": "Chat not found"})

    # Add user message
    user_msg = {
        "role": "user",
        "content": req.content,
        "timestamp": _now(),
    }
    if req.attachment:
        user_msg["attachment"] = req.attachment
    chat["messages"].append(user_msg)

    # Auto-title from first user message
    if len(chat["messages"]) == 1:
        chat["title"] = req.content[:50].strip() + ("..." if len(req.content) > 50 else "")

    # Build PDF context if attachments exist
    pdf_context = None
    if chat.get("attachments"):
        pdf_texts = []
        processor = PDFProcessor()
        for file_id in chat["attachments"]:
            pdf_path = get_upload_path(username, file_id)
            if pdf_path:
                try:
                    chunks = processor.process_pdf(pdf_path)
                    pdf_texts.append("\n\n".join(c.text for c in chunks))
                except Exception:
                    pass
        if pdf_texts:
            pdf_context = "\n\n---\n\n".join(pdf_texts)

    # Get AI response
    model_key = req.model or chat.get("model", DEFAULT_MODEL_KEY)
    response_text = chat_engine.chat(
        chat["messages"], model_key=model_key,
        pdf_context=pdf_context, mode=req.mode,
    )

    # Save AI response
    assistant_msg = {
        "role": "assistant",
        "content": response_text,
        "model": model_key,
        "timestamp": _now(),
    }
    chat["messages"].append(assistant_msg)
    save_chat(username, req.chat_id, chat)

    return {
        "role": "assistant",
        "content": response_text,
        "model": model_key,
    }


@app.post("/api/chat/{chat_id}/attach")
async def attach_pdf(chat_id: str, file_id: str = Form(...), authorization: str = Header(None)):
    user = _get_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})

    username = user["username"]
    chat = get_chat(username, chat_id)
    if not chat:
        return JSONResponse(status_code=404, content={"error": "Chat not found"})

    if file_id not in chat.get("attachments", []):
        chat.setdefault("attachments", []).append(file_id)
        save_chat(username, chat_id, chat)

    return {"ok": True}


@app.post("/api/chat/{chat_id}/regenerate")
async def api_regenerate(chat_id: str, model: str = DEFAULT_MODEL_KEY, authorization: str = Header(None)):
    user = _get_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})

    username = user["username"]
    chat = get_chat(username, chat_id)
    if not chat or not chat["messages"]:
        return JSONResponse(status_code=404, content={"error": "Chat not found or empty"})

    # Remove last assistant message
    if chat["messages"][-1]["role"] == "assistant":
        chat["messages"].pop()

    # Build PDF context
    pdf_context = None
    if chat.get("attachments"):
        pdf_texts = []
        processor = PDFProcessor()
        for file_id in chat["attachments"]:
            pdf_path = get_upload_path(username, file_id)
            if pdf_path:
                try:
                    chunks = processor.process_pdf(pdf_path)
                    pdf_texts.append("\n\n".join(c.text for c in chunks))
                except Exception:
                    pass
        if pdf_texts:
            pdf_context = "\n\n---\n\n".join(pdf_texts)

    model_key = model or chat.get("model", DEFAULT_MODEL_KEY)
    response_text = chat_engine.chat(chat["messages"], model_key=model_key, pdf_context=pdf_context)

    assistant_msg = {
        "role": "assistant",
        "content": response_text,
        "model": model_key,
        "timestamp": _now(),
    }
    chat["messages"].append(assistant_msg)
    save_chat(username, chat_id, chat)

    return {
        "role": "assistant",
        "content": response_text,
        "model": model_key,
    }


@app.put("/api/chat/{chat_id}/rename")
async def api_rename_chat(chat_id: str, req: RenameRequest, authorization: str = Header(None)):
    user = _get_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})

    username = user["username"]
    chat = get_chat(username, chat_id)
    if not chat:
        return JSONResponse(status_code=404, content={"error": "Chat not found"})

    chat["title"] = req.title
    save_chat(username, chat_id, chat)
    return {"ok": True}


@app.delete("/api/chat/{chat_id}")
async def api_delete_chat_endpoint(chat_id: str, authorization: str = Header(None)):
    user = _get_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})

    success = delete_chat(user["username"], chat_id)
    if not success:
        return JSONResponse(status_code=404, content={"error": "Chat not found"})
    return {"ok": True}


@app.get("/api/chat/{chat_id}/export")
async def api_export_chat(chat_id: str, authorization: str = Header(None)):
    user = _get_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})

    chat = get_chat(user["username"], chat_id)
    if not chat:
        return JSONResponse(status_code=404, content={"error": "Chat not found"})

    lines = [f"# {chat.get('title', 'Chat')}\n"]
    lines.append(f"*Model: {chat.get('model', 'unknown')} | Created: {chat.get('created_at', '')}*\n")
    lines.append("---\n")
    for msg in chat.get("messages", []):
        role = msg["role"]
        content = msg["content"]
        if role == "user":
            lines.append(f"## 🧑 You\n\n{content}\n")
        else:
            model_tag = msg.get("model", chat.get("model", ""))
            lines.append(f"## 🤖 Assistant ({model_tag})\n\n{content}\n")
        lines.append("---\n")
    md = "\n".join(lines)

    return PlainTextResponse(md, media_type="text/markdown", headers={
        "Content-Disposition": f"attachment; filename=chat_{chat_id}.md"
    })


# ──────────────────────────────────────────────
# Questionnaire API
# ──────────────────────────────────────────────

class QuestionnaireRequest(BaseModel):
    message: str
    model: str = DEFAULT_MODEL_KEY
    chat_history: List[dict] = []

@app.post("/api/questionnaire/start")
async def api_start_questionnaire(authorization: str = Header(None)):
    user = _get_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})

    # Generate first question
    response = chat_engine.chat(
        [{"role": "user", "content": "Start the health screening questionnaire. Ask the first question."}],
        mode="questionnaire",
    )

    display_message = response
    if "```json" in display_message:
        parts = display_message.split("```json")
        pre_json = parts[0]
        post_json = parts[1].split("```")[1] if "```" in parts[1] and len(parts[1].split("```")) > 1 else ""
        display_message = (pre_json + post_json).strip()

    return {
        "message": display_message,
        "complete": False,
    }


@app.post("/api/questionnaire/respond")
async def api_questionnaire_respond(req: QuestionnaireRequest, authorization: str = Header(None)):
    user = _get_user(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})

    username = user["username"]

    # Build conversation
    messages = req.chat_history + [{"role": "user", "content": req.message}]
    
    response = chat_engine.chat(messages, model_key=req.model, mode="questionnaire")

    complete = "[QUESTIONNAIRE_COMPLETE]" in response
    
    # Extract data ALWAYS in real-time
    questionnaire_data = _extract_questionnaire_data(response)
    risk_data = None
    if questionnaire_data:
        save_questionnaire(username, questionnaire_data)
        risk_data = run_questionnaire_risk_update(username, questionnaire_data)
    
    # Strip the JSON block from the user-facing message so it looks clean
    display_message = response
    if "```json" in display_message:
        parts = display_message.split("```json")
        pre_json = parts[0]
        post_json = parts[1].split("```")[1] if "```" in parts[1] and len(parts[1].split("```")) > 1 else ""
        display_message = (pre_json + post_json).strip()
    
    display_message = display_message.replace("[QUESTIONNAIRE_COMPLETE]", "").strip()

    return {
        "message": display_message,
        "complete": complete,
        "questionnaire_data": questionnaire_data,
        "risk": risk_data,
    }


def _extract_questionnaire_data(response: str) -> dict:
    """Extract structured questionnaire data from AI's final response."""
    # Try to find JSON in the response
    if "```json" in response:
        try:
            json_str = response.split("```json")[1].split("```")[0].strip()
            return json.loads(json_str)
        except (IndexError, json.JSONDecodeError):
            pass
    
    # Fallback: parse from keywords
    text = response.lower()
    return {
        "fever": "fever: yes" in text or "has fever" in text,
        "cough": "cough: yes" in text or "has cough" in text,
        "breathing_difficulty": "breathing: yes" in text or "breathing difficulty: yes" in text,
        "raw_response": response,
    }


# ──────────────────────────────────────────────
# Admin API
# ──────────────────────────────────────────────

@app.get("/api/admin/patients")
async def api_admin_patients(authorization: str = Header(None)):
    if not authorization or not is_admin(authorization.replace("Bearer ", "").strip()):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})
    return list_all_patients()


@app.get("/api/admin/patient/{username}")
async def api_admin_patient_detail(username: str, authorization: str = Header(None)):
    if not authorization or not is_admin(authorization.replace("Bearer ", "").strip()):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})
    return get_patient_overview(username)


@app.get("/api/admin/stats")
async def api_admin_stats(authorization: str = Header(None)):
    if not authorization or not is_admin(authorization.replace("Bearer ", "").strip()):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})
    return get_admin_stats()


@app.get("/api/admin/patient/{username}/summary/{summary_type}")
async def api_admin_patient_summary(username: str, summary_type: str, authorization: str = Header(None)):
    if not authorization or not is_admin(authorization.replace("Bearer ", "").strip()):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})
    content = get_summary(username, summary_type)
    if content is None:
        return JSONResponse(status_code=404, content={"error": "Summary not found"})
    return {"type": summary_type, "content": content}


@app.get("/api/admin/users")
async def api_admin_users(authorization: str = Header(None)):
    if not authorization or not is_admin(authorization.replace("Bearer ", "").strip()):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})
    return list_all_users()


# ──────────────────────────────────────────────
# Legacy Status API
# ──────────────────────────────────────────────

@app.get("/api/status/{job_id}")
async def get_status(job_id: str):
    if job_id not in jobs_db:
        return JSONResponse(status_code=404, content={"message": "Job not found"})
    return jobs_db[job_id]


# ──────────────────────────────────────────────
# Utility
# ──────────────────────────────────────────────

def _now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()
