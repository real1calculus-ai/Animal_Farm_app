#!/usr/bin/env python3
"""
Writes .env from prompts, so credentials never pass through an editor, a
shell history, or a chat transcript.

Also percent-encodes passwords into the connection URLs — the step people
miss. A password containing @ or & breaks URL parsing and surfaces as a
host-not-found error that mentions nothing about passwords.

  python3 scripts/setup-env.py
"""

import getpass
import pathlib
import sys
import urllib.parse

PROJECT_REF = "pdltehmoawndbkdtgrke"
POOLER_HOST = "aws-1-eu-west-1.pooler.supabase.com"

TEMPLATE = """\
# Supabase — project {ref} ({region}). Written by scripts/setup-env.py.

# Runtime connection. {runtime_note}
DATABASE_URL="postgresql://{runtime_user}.{ref}:{runtime_pw}@{host}:6543/postgres?pgbouncer=true"

# Migrations, as `postgres`. app_user deliberately cannot run DDL, and the
# session pooler is used rather than the direct host because that host is
# IPv6-only without the IPv4 add-on.
DIRECT_URL="postgresql://postgres.{ref}:{owner_pw}@{host}:5432/postgres"

NEXT_PUBLIC_SUPABASE_URL="https://{ref}.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="{anon}"
SUPABASE_SERVICE_ROLE_KEY="{service}"
"""

ENFORCING = (
    "Runs as app_user, which cannot bypass row-level security, so the\n"
    "# tenant policies are enforced by the database."
)
BYPASSING = (
    "Runs as postgres, which carries BYPASSRLS — the tenant policies\n"
    "# exist but are NOT enforced on this connection."
)


def main() -> int:
    try:
        tty = open("/dev/tty")
    except OSError:
        print("Run this in an interactive terminal.", file=sys.stderr)
        return 1

    print("Nothing is echoed, and nothing is written anywhere but .env.\n")

    print("Use app_user for the runtime connection? This is what turns")
    print("row-level security on. Requires that you have already run, in the")
    print("Supabase SQL editor:")
    print("\n    ALTER ROLE app_user WITH LOGIN PASSWORD '<your choice>';\n")
    print("Enable it now? [y/N]: ", end="", flush=True)
    use_app_user = tty.readline().strip().lower() in {"y", "yes"}

    owner_pw = getpass.getpass("\nDatabase password for `postgres` (migrations): ")
    if not owner_pw:
        print("No password given — nothing written.", file=sys.stderr)
        return 1

    if use_app_user:
        runtime_pw = getpass.getpass("Password you set for `app_user`: ")
        if not runtime_pw:
            print("No app_user password — nothing written.", file=sys.stderr)
            return 1
    else:
        runtime_pw = owner_pw

    print("\nanon / publishable key (paste, then Enter):")
    anon = tty.readline().strip()
    service = getpass.getpass("service_role / secret key: ")

    if not anon or not service:
        print("Both keys are required — nothing written.", file=sys.stderr)
        return 1

    quote = lambda v: urllib.parse.quote(v, safe="")

    path = pathlib.Path(__file__).resolve().parent.parent / ".env"
    path.write_text(
        TEMPLATE.format(
            ref=PROJECT_REF,
            region="eu-west-1",
            host=POOLER_HOST,
            runtime_user="app_user" if use_app_user else "postgres",
            runtime_note=ENFORCING if use_app_user else BYPASSING,
            runtime_pw=quote(runtime_pw),
            owner_pw=quote(owner_pw),
            anon=anon,
            service=service,
        )
    )
    path.chmod(0o600)

    print(f"\nWrote {path}")
    print(f"  runtime role: {'app_user (RLS enforced)' if use_app_user else 'postgres (RLS bypassed)'}")
    print(f"  anon key: {len(anon)} chars · service_role key: {len(service)} chars")
    print("\nNext:  npm run db:check  &&  npm run verify:tenant")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
