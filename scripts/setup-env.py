#!/usr/bin/env python3
"""
Writes .env from prompts, so credentials never pass through an editor, a
shell history, or a chat transcript.

It also percent-encodes the database password into the connection URLs, which
is the step people most often miss: a password containing @ or & silently
breaks URL parsing and surfaces as a baffling host-not-found error rather than
anything mentioning the password.
"""

import getpass
import pathlib
import sys
import urllib.parse

PROJECT_REF = "pdltehmoawndbkdtgrke"
POOLER_HOST = "aws-1-eu-west-1.pooler.supabase.com"

TEMPLATE = """\
# Supabase — project {ref} (eu-west-1). Written by scripts/setup-env.py.

# Pooled connection (transaction mode, 6543) — the app at runtime.
DATABASE_URL="postgresql://postgres.{ref}:{pw}@{host}:6543/postgres?pgbouncer=true"

# Session pooler (5432) — Prisma Migrate, which cannot run through the
# transaction pooler. The pooler host rather than db.{ref}.supabase.co because
# that direct host is IPv6-only without the IPv4 add-on.
DIRECT_URL="postgresql://postgres.{ref}:{pw}@{host}:5432/postgres"

NEXT_PUBLIC_SUPABASE_URL="https://{ref}.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="{anon}"
SUPABASE_SERVICE_ROLE_KEY="{service}"
"""


def main() -> int:
    try:
        tty = open("/dev/tty")
    except OSError:
        print("Run this in an interactive terminal.", file=sys.stderr)
        return 1

    print("Values are not echoed and are written straight to .env.\n")

    password = getpass.getpass("Database password: ")
    if not password:
        print("No password given — nothing written.", file=sys.stderr)
        return 1

    print("anon / publishable key (paste, then Enter):")
    anon = tty.readline().strip()

    service = getpass.getpass("service_role / secret key: ")

    if not anon or not service:
        print("Both keys are required — nothing written.", file=sys.stderr)
        return 1

    encoded = urllib.parse.quote(password, safe="")

    path = pathlib.Path(__file__).resolve().parent.parent / ".env"
    path.write_text(
        TEMPLATE.format(
            ref=PROJECT_REF, host=POOLER_HOST, pw=encoded, anon=anon, service=service
        )
    )
    path.chmod(0o600)

    changed = encoded != password
    print(f"\nWrote {path}")
    print(f"  password percent-encoded for the URL: {'yes' if changed else 'not needed'}")
    print(f"  anon key: {len(anon)} chars")
    print(f"  service_role key: {len(service)} chars")
    print("\nNow tell Claude to run the migration.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
