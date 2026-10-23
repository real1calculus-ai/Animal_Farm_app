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
import re
import pathlib
import sys
import urllib.parse

PROJECT_REF = "pdltehmoawndbkdtgrke"
POOLER_HOST = "aws-1-eu-west-1.pooler.supabase.com"

TEMPLATE = """\
# Supabase — project {ref} ({region}). Written by scripts/setup-env.py.

# Pooled connection (transaction mode, 6543) — the app at runtime.
#
# Connects as `postgres`, which carries BYPASSRLS, and that is deliberate.
# Supabase's pooler will not authenticate a custom role: `app_user` is refused
# 28P01 however recently its password was set, on the session pooler as well as
# the transaction pooler. It also silently discards `options=-c role=...`.
# src/lib/tenant.ts therefore issues SET LOCAL ROLE app_user inside every
# transaction, so no query reaches a table with the policies bypassed.
# See docs/rls-setup.md. Verify with: npm run verify:tenant
DATABASE_URL="postgresql://postgres.{ref}:{owner_pw}@{host}:6543/postgres?pgbouncer=true"

# Migrations, as `postgres` with no role switch — app_user cannot run DDL. The
# session pooler rather than the direct host because that host is IPv6-only
# without the IPv4 add-on.
DIRECT_URL="postgresql://postgres.{ref}:{owner_pw}@{host}:5432/postgres"

NEXT_PUBLIC_SUPABASE_URL="https://{ref}.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="{anon}"
SUPABASE_SERVICE_ROLE_KEY="{service}"
{preserved}"""

# Keys this script owns. Anything else already in .env — demo mode, feature
# flags — is carried across untouched. An earlier version wrote the template
# and nothing else, which silently dropped NEXT_PUBLIC_DEMO_MODE and took the
# demo offline with no indication why.
OWNED_KEYS = {
    "DATABASE_URL",
    "DIRECT_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
}


def preserved_lines(path: pathlib.Path) -> str:
    """Lines from an existing .env that this script does not manage."""
    if not path.exists():
        return ""

    kept = []
    for line in path.read_text().splitlines():
        match = re.match(r"\s*([A-Z_][A-Z0-9_]*)\s*=", line)
        if match and match.group(1) not in OWNED_KEYS:
            kept.append(line)

    if not kept:
        return ""
    return "\n# Carried over from the previous .env.\n" + "\n".join(kept) + "\n"


def main() -> int:
    try:
        tty = open("/dev/tty")
    except OSError:
        print("Run this in an interactive terminal.", file=sys.stderr)
        return 1

    print("Nothing is echoed, and nothing is written anywhere but .env.")
    print("Row-level security does not depend on anything asked here — it is")
    print("applied per transaction in src/lib/tenant.ts. See docs/rls-setup.md.\n")

    owner_pw = getpass.getpass("Database password for `postgres`: ")
    if not owner_pw:
        print("No password given — nothing written.", file=sys.stderr)
        return 1

    print("\nanon / publishable key (paste, then Enter):")
    anon = tty.readline().strip()
    service = getpass.getpass("service_role / secret key: ")

    if not anon or not service:
        print("Both keys are required — nothing written.", file=sys.stderr)
        return 1

    quote = lambda v: urllib.parse.quote(v, safe="")

    path = pathlib.Path(__file__).resolve().parent.parent / ".env"
    preserved = preserved_lines(path)

    path.write_text(
        TEMPLATE.format(
            ref=PROJECT_REF,
            region="eu-west-1",
            host=POOLER_HOST,
            owner_pw=quote(owner_pw),
            anon=anon,
            service=service,
            preserved=preserved,
        )
    )
    path.chmod(0o600)

    print(f"\nWrote {path}")
    print(f"  anon key: {len(anon)} chars · service_role key: {len(service)} chars")
    if preserved:
        kept = [line.split("=")[0] for line in preserved.splitlines() if "=" in line]
        print(f"  carried over: {', '.join(kept)}")
    print("\nNext:  npm run db:check  &&  npm run verify:tenant")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
