#!/usr/bin/env python3
"""
ProxyProof — User Account Provisioning & Role Management CLI
Safely creates, inspects, and promotes accounts in the ProxyProof database.
"""

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Setup paths
root_dir = Path(__file__).resolve().parent.parent
backend_dir = root_dir / "backend"
sys.path.insert(0, str(backend_dir))
sys.path.insert(0, str(root_dir))

# Read DATABASE_URL from .env.local or .env
db_url = os.environ.get("DATABASE_URL")
if not db_url:
    for env_file in [root_dir / ".env.local", root_dir / ".env", root_dir / "backend" / ".env"]:
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith("DATABASE_URL="):
                    db_url = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
        if db_url:
            break

if not db_url:
    db_url = "sqlite:///./proxyproof.db"

if db_url.startswith("postgresql://") and not db_url.startswith("postgresql+psycopg2://"):
    db_url = db_url.replace("postgresql://", "postgresql+psycopg2://", 1)

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.user import User, UserRole, StudentProfile
from app.models.audit import AuditLog
from app.core.security import hash_password

engine = create_engine(db_url)
SessionLocal = sessionmaker(bind=engine)


def list_users(db):
    print("\n=== PROXYPROOF REGISTERED ACCOUNTS ===")
    users = db.query(User).order_by(User.id).all()
    print(f"{'ID':<4} | {'Role':<10} | {'Email':<35} | {'Full Name':<25} | {'Active':<6}")
    print("-" * 90)
    for u in users:
        print(f"{u.id:<4} | {u.role.value:<10} | {u.email:<35} | {u.full_name:<25} | {str(u.is_active):<6}")
    print("-" * 90)
    print(f"Total: {len(users)} users\n")


def provision_user(db, email: str, password: str, full_name: str, role: str, student_id: str = None):
    email = email.lower().strip()
    role_enum = UserRole(role.lower().strip())
    
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        print(f"Updating existing user account: {email}")
        existing.full_name = full_name.strip()
        existing.role = role_enum
        if password:
            existing.hashed_password = hash_password(password)
        db.commit()
        db.refresh(existing)
        print(f"✓ Account updated successfully: {email} (ID: {existing.id}, Role: {existing.role.value})")
        return existing

    print(f"Creating new {role_enum.value} account: {email}")
    new_user = User(
        email=email,
        hashed_password=hash_password(password),
        full_name=full_name.strip(),
        role=role_enum,
        is_active=True
    )
    db.add(new_user)
    db.flush()

    if role_enum == UserRole.STUDENT and student_id:
        profile = StudentProfile(
            user_id=new_user.id,
            student_id_number=student_id.strip(),
            department="Computer Science",
            batch=f"{datetime.now().year}-{datetime.now().year+4}"
        )
        db.add(profile)

    audit = AuditLog(
        user_id=new_user.id,
        action="USER_PROVISIONED_VIA_CLI",
        entity_type="User",
        entity_id=new_user.id,
        details=f"User {email} provisioned via CLI with role {role_enum.value}"
    )
    db.add(audit)
    db.commit()
    db.refresh(new_user)
    print(f"✓ Account provisioned successfully: {email} (ID: {new_user.id}, Role: {new_user.role.value})")
    return new_user


def main():
    parser = argparse.ArgumentParser(description="ProxyProof User Provisioning CLI")
    parser.add_argument("--list", action="store_true", help="List all accounts")
    parser.add_argument("--email", type=str, help="Account email address")
    parser.add_argument("--password", type=str, help="Account password")
    parser.add_argument("--name", type=str, help="Full name of user")
    parser.add_argument("--role", type=str, choices=["student", "organiser", "admin"], default="organiser", help="Role to assign")
    parser.add_argument("--student-id", type=str, help="Student ID number (required for student accounts)")
    
    args = parser.parse_args()
    db = SessionLocal()
    try:
        if args.list:
            list_users(db)
            return

        if not args.email:
            parser.print_help()
            print("\nError: --email is required when provisioning a user.")
            sys.exit(1)

        password = args.password or "ProxyProof2026!"
        name = args.name or args.email.split("@")[0].title()
        provision_user(db, args.email, password, name, args.role, args.student_id)
        list_users(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
