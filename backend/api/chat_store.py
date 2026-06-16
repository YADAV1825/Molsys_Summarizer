import os
import json
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

CHATS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "chats")
os.makedirs(CHATS_DIR, exist_ok=True)


def _chat_path(chat_id: str) -> str:
    return os.path.join(CHATS_DIR, f"{chat_id}.json")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_chat(title: str = "New Chat", model: str = "nemotron-super", is_temporary: bool = False) -> Dict[str, Any]:
    chat_id = str(uuid.uuid4())
    chat = {
        "id": chat_id,
        "title": title,
        "model": model,
        "created_at": _now(),
        "updated_at": _now(),
        "is_temporary": is_temporary,
        "messages": [],
        "attachments": [],
    }
    if not is_temporary:
        with open(_chat_path(chat_id), "w", encoding="utf-8") as f:
            json.dump(chat, f, ensure_ascii=False, indent=2)
    return chat


def get_chat(chat_id: str) -> Optional[Dict[str, Any]]:
    path = _chat_path(chat_id)
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_chat(chat: Dict[str, Any]):
    if chat.get("is_temporary"):
        return
    chat["updated_at"] = _now()
    with open(_chat_path(chat["id"]), "w", encoding="utf-8") as f:
        json.dump(chat, f, ensure_ascii=False, indent=2)


def list_chats() -> List[Dict[str, Any]]:
    chats = []
    for filename in os.listdir(CHATS_DIR):
        if not filename.endswith(".json"):
            continue
        path = os.path.join(CHATS_DIR, filename)
        try:
            with open(path, "r", encoding="utf-8") as f:
                chat = json.load(f)
            preview = ""
            if chat.get("messages"):
                last = chat["messages"][-1]
                preview = last.get("content", "")[:80]
            chats.append({
                "id": chat["id"],
                "title": chat.get("title", "Untitled"),
                "model": chat.get("model", "nemotron-super"),
                "updated_at": chat.get("updated_at", ""),
                "preview": preview,
                "message_count": len(chat.get("messages", [])),
            })
        except (json.JSONDecodeError, KeyError):
            continue
    chats.sort(key=lambda c: c.get("updated_at", ""), reverse=True)
    return chats


def add_message(chat_id: str, role: str, content: str, model: str = None, attachment: dict = None) -> Optional[Dict[str, Any]]:
    chat = get_chat(chat_id)
    if not chat:
        return None
    msg = {
        "role": role,
        "content": content,
        "timestamp": _now(),
    }
    if model:
        msg["model"] = model
    if attachment:
        msg["attachment"] = attachment
    chat["messages"].append(msg)
    # Auto-title from first user message
    if len(chat["messages"]) == 1 and role == "user":
        chat["title"] = content[:50].strip() + ("..." if len(content) > 50 else "")
    _save_chat(chat)
    return msg


def update_message(chat_id: str, msg_index: int, content: str) -> bool:
    chat = get_chat(chat_id)
    if not chat or msg_index >= len(chat["messages"]):
        return False
    chat["messages"][msg_index]["content"] = content
    chat["messages"][msg_index]["timestamp"] = _now()
    # Truncate all messages after edited one (re-generation flow)
    chat["messages"] = chat["messages"][:msg_index + 1]
    _save_chat(chat)
    return True


def delete_chat(chat_id: str) -> bool:
    path = _chat_path(chat_id)
    if os.path.exists(path):
        os.remove(path)
        return True
    return False


def rename_chat(chat_id: str, new_title: str) -> bool:
    chat = get_chat(chat_id)
    if not chat:
        return False
    chat["title"] = new_title
    _save_chat(chat)
    return True


def search_chats(query: str) -> List[Dict[str, Any]]:
    query_lower = query.lower()
    results = []
    for chat_summary in list_chats():
        chat = get_chat(chat_summary["id"])
        if not chat:
            continue
        if query_lower in chat.get("title", "").lower():
            results.append(chat_summary)
            continue
        for msg in chat.get("messages", []):
            if query_lower in msg.get("content", "").lower():
                results.append(chat_summary)
                break
    return results


def add_attachment(chat_id: str, file_id: str) -> bool:
    chat = get_chat(chat_id)
    if not chat:
        return False
    if file_id not in chat.get("attachments", []):
        chat.setdefault("attachments", []).append(file_id)
        _save_chat(chat)
    return True


def export_chat_md(chat_id: str) -> Optional[str]:
    chat = get_chat(chat_id)
    if not chat:
        return None
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
    return "\n".join(lines)
