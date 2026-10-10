#!/usr/bin/env python3
"""ROSTA ONLY: bootstrap a single panel owner on an isolated self-hosted Supabase.

Run on the ROSTA OVH VPS: python3 scripts/bootstrap-rosta-owner.py --apply
Secrets are read from /home/ubuntu/rosta-supabase/.env and never printed or saved.
Never connects to Ruth's Supabase, Docker, databases, or web server.
"""
import argparse
import getpass
import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROSTA_BASE = "http://127.0.0.1:18000"
ROSTA_ENV = Path("/home/ubuntu/rosta-supabase/.env")
OWNER_EMAIL = "ruthistanbull@gmail.com"
ALLOWED_ROLES = {"owner", "admin", "operations", "support", "marketing", "viewer"}


def read_env():
    env = {}
    for raw in ROSTA_ENV.read_text().splitlines():
        if "=" in raw and not raw.lstrip().startswith("#"):
            key, value = raw.split("=", 1)
            env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def api(key, method, path, payload=None):
    headers = {
        "apikey": key,
        "Authorization": "Bearer " + key,
        "Accept": "application/json",
    }
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        if method == "POST" and path.startswith("/rest/v1/profiles"):
            headers["Prefer"] = "resolution=merge-duplicates,return=representation"
        data = json.dumps(payload).encode("utf-8")
    req = Request(ROSTA_BASE + path, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=20) as res:
            return json.loads(res.read().decode("utf-8") or "null")
    except HTTPError as exc:
        # Response body may contain an implementation detail; not credentials.
        raise RuntimeError(f"{method} {path.split('?')[0]}: HTTP {exc.code}") from None
    except URLError as exc:
        raise RuntimeError("ROSTA yerel API erişilemiyor") from exc


def main():
    parser = argparse.ArgumentParser(description="ROSTA root owner bootstrap")
    parser.add_argument("--apply", action="store_true", help="Create/update the owner account")
    args = parser.parse_args()

    if not ROSTA_ENV.is_file():
        raise SystemExit("ROSTA .env bulunamadı")
    service_key = read_env().get("SERVICE_ROLE_KEY", "")
    if not service_key:
        raise SystemExit("ROSTA SERVICE_ROLE_KEY eksik")

    # Read-only first. Abort on ambiguous identity or more than one owner.
    users_result = api(service_key, "GET", "/auth/v1/admin/users?page=1&per_page=1000")
    users = users_result.get("users", []) if isinstance(users_result, dict) else []
    if not isinstance(users, list):
        raise SystemExit("Auth kullanıcı listesi okunamadı")
    matching = [u for u in users if str(u.get("email", "")).lower() == OWNER_EMAIL]
    if len(matching) > 1:
        raise SystemExit("DUR: Aynı e-postada birden çok Auth hesabı")
    for user in users:
        if str(user.get("app_metadata", {}).get("panel_role", "")).lower() == "owner" and user.get("email", "").lower() != OWNER_EMAIL:
            raise SystemExit("DUR: Başka bir sahip hesabı var. Elle kontrol edilmeli.")

    profile_query = "/rest/v1/profiles?select=id,auth_user_id,email,role&email=eq." + quote(OWNER_EMAIL, safe="")
    profiles = api(service_key, "GET", profile_query)
    if not isinstance(profiles, list) or len(profiles) > 1:
        raise SystemExit("DUR: Profil eşleştirmesi belirsiz")
    existing = matching[0] if matching else None
    if profiles and profiles[0].get("auth_user_id") and (not existing or profiles[0]["auth_user_id"] != existing.get("id")):
        raise SystemExit("DUR: E-posta başka bir Auth kullanıcısına bağlı")

    print("ROSTA ana hesap e-postası:", OWNER_EMAIL)
    print("Auth durumu:", "MEVCUT" if existing else "OLUSTURULACAK")
    print("Profil durumu:", "MEVCUT" if profiles else "OLUSTURULACAK")
    print("Rol:", "owner")
    if not args.apply:
        print("PLAN: Veriler değiştirilmedi. Kurulum için --apply kullan.")
        return

    password = getpass.getpass("ROSTA ana hesap şifresi (ekranda görünmez): ")
    if len(password) < 12:
        raise SystemExit("DUR: Şifre en az 12 karakter olmalı")
    confirmation = getpass.getpass("Şifreyi tekrar yaz: ")
    if password != confirmation:
        raise SystemExit("DUR: Şifreler eşleşmedi")
    del confirmation

    if existing:
        uid = existing["id"]
        previous_app = existing.get("app_metadata") or {}
        api(service_key, "PUT", "/auth/v1/admin/users/" + quote(uid, safe=""), {
            "password": password,
            "email_confirm": True,
            "app_metadata": {**previous_app, "panel_role": "owner", "panel_status": "active"},
        })
    else:
        created = api(service_key, "POST", "/auth/v1/admin/users", {
            "email": OWNER_EMAIL,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"full_name": "ROSTA Ana Yönetici"},
            "app_metadata": {"panel_role": "owner", "panel_status": "active"},
        })
        uid = created.get("id") or (created.get("user") or {}).get("id")
        if not uid:
            raise SystemExit("Auth oluşturuldu fakat kullanıcı ID'si okunamadı; tekrar denemeden önce kontrol et")
    del password

    # The existing ROSTA profile is preserved and upgraded in place.
    api(service_key, "POST", "/rest/v1/profiles?on_conflict=email", {
        "email": OWNER_EMAIL,
        "auth_user_id": uid,
        "full_name": "ROSTA Ana Yönetici",
        "role": "admin",
    })
    print("ROSTA ANA HESAP KURULUMU TAMAMLANDI (owner).")
    print("Kullanıcı bilgileri yalnızca ROSTA Auth ve ROSTA profiles tablosuna yazıldı.")


if __name__ == "__main__":
    main()
