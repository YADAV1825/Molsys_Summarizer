"""
JSON-based authentication system with user/admin roles.
No database — stores everything in data/users.json and data/sessions.json.
"""
import os
import json
import uuid
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
USERS_FILE = os.path.join(DATA_DIR, "users.json")
SESSIONS_FILE = os.path.join(DATA_DIR, "sessions.json")

os.makedirs(DATA_DIR, exist_ok=True)

SESSION_EXPIRY_HOURS = 72  # 3 days


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def _load_users() -> Dict[str, Any]:
    if not os.path.exists(USERS_FILE):
        return {}
    with open(USERS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_users(users: Dict[str, Any]):
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(users, f, ensure_ascii=False, indent=2)


def _load_sessions() -> Dict[str, Any]:
    if not os.path.exists(SESSIONS_FILE):
        return {}
    with open(SESSIONS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_sessions(sessions: Dict[str, Any]):
    with open(SESSIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(sessions, f, ensure_ascii=False, indent=2)


def _seed_admin():
    """Create default admin account if no users exist."""
    users = _load_users()
    if "admin" not in users:
        users["admin"] = {
            "password_hash": _hash_password("admin123"),
            "role": "admin",
            "full_name": "System Admin",
            "created_at": _now(),
        }
        _save_users(users)


# Seed admin on module load
_seed_admin()


def register(username: str, password: str, full_name: str) -> Dict[str, Any]:
    """Register a new user. Returns user info or error."""
    username = username.strip().lower()
    if not username or not password:
        return {"error": "Username and password are required"}
    if len(username) < 3:
        return {"error": "Username must be at least 3 characters"}
    if len(password) < 4:
        return {"error": "Password must be at least 4 characters"}

    users = _load_users()
    if username in users:
        return {"error": "Username already exists"}

    users[username] = {
        "password_hash": _hash_password(password),
        "role": "user",
        "full_name": full_name.strip() or username,
        "created_at": _now(),
    }
    _save_users(users)

    # Create patient directory
    from backend.api.patient_store import create_patient_dir
    create_patient_dir(username)

    # Auto-login
    token = _create_session(username)
    return {
        "ok": True,
        "token": token,
        "user": {
            "username": username,
            "role": "user",
            "full_name": users[username]["full_name"],
        },
    }


def login(username: str, password: str) -> Dict[str, Any]:
    """Login and return session token."""
    username = username.strip().lower()
    users = _load_users()

    if username not in users:
        return {"error": "Invalid username or password"}

    if users[username]["password_hash"] != _hash_password(password):
        return {"error": "Invalid username or password"}

    token = _create_session(username)
    return {
        "ok": True,
        "token": token,
        "user": {
            "username": username,
            "role": users[username]["role"],
            "full_name": users[username]["full_name"],
        },
    }


def _create_session(username: str) -> str:
    """Create a new session token for the user."""
    sessions = _load_sessions()
    token = str(uuid.uuid4())
    expires = (datetime.now(timezone.utc) + timedelta(hours=SESSION_EXPIRY_HOURS)).isoformat()
    sessions[token] = {
        "username": username,
        "created_at": _now(),
        "expires_at": expires,
    }
    _save_sessions(sessions)
    return token


def get_current_user(token: str) -> Optional[Dict[str, Any]]:
    """Validate session token and return user info. Returns None if invalid."""
    if not token:
        return None

    sessions = _load_sessions()
    session = sessions.get(token)
    if not session:
        return None

    # Check expiry
    expires = datetime.fromisoformat(session["expires_at"])
    if datetime.now(timezone.utc) > expires:
        del sessions[token]
        _save_sessions(sessions)
        return None

    users = _load_users()
    username = session["username"]
    if username not in users:
        return None

    return {
        "username": username,
        "role": users[username]["role"],
        "full_name": users[username]["full_name"],
    }


def is_admin(token: str) -> bool:
    """Check if the token belongs to an admin user."""
    user = get_current_user(token)
    return user is not None and user.get("role") == "admin"


def list_all_users() -> list:
    """List all registered users (for admin). Excludes password hashes."""
    users = _load_users()
    result = []
    for username, data in users.items():
        result.append({
            "username": username,
            "role": data["role"],
            "full_name": data["full_name"],
            "created_at": data["created_at"],
        })
    return result


def logout(token: str) -> bool:
    """Remove session token."""
    sessions = _load_sessions()
    if token in sessions:
        del sessions[token]
        _save_sessions(sessions)
        return True
    return False
