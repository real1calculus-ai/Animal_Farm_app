"use client";

import type { PowerSyncBackendConnector, CrudEntry } from "@powersync/web";
import type { CommonPowerSyncDatabase } from "@powersync/web";
import { createClient } from "@/lib/supabase/client";

/**
 * Bridges the local PowerSync database to this app's backend.
 *
 * `fetchCredentials` uses the Supabase session token directly as the
 * PowerSync auth token — PowerSync can validate a Supabase-issued JWT
 * itself when the PowerSync instance is configured with the project's JWKS
 * endpoint, so no separate token-minting endpoint is needed. NEEDS
 * VERIFICATION against current PowerSync docs before relying on it: this
 * session couldn't reach docs.powersync.com (network policy) to confirm
 * the exact current setup step on the PowerSync-instance side.
 *
 * `uploadData` deliberately does NOT write straight to Postgres the way
 * PowerSync's own quickstarts usually do (typically via the Supabase
 * client, relying entirely on RLS for authorization). This app's
 * validation and permission checks — requireRole, diagnosis
 * normalisation, the medication parsing in src/app/health/actions.ts —
 * live in TypeScript, not in Postgres policies, and re-deriving all of
 * that as RLS/triggers would both duplicate logic and weaken it (case in
 * point: `assertNotLastAdmin` and friends are not expressible as a row
 * policy at all). So the queue drains through a real API route
 * (src/app/api/offline/sync/route.ts) that reuses the existing
 * server-side validation and Prisma writes instead of bypassing them.
 */
export function createPowerSyncConnector(): PowerSyncBackendConnector {
  return {
    async fetchCredentials() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return null;

      const endpoint = process.env.NEXT_PUBLIC_POWERSYNC_URL;
      if (!endpoint) {
        throw new Error(
          "NEXT_PUBLIC_POWERSYNC_URL is not set — offline sync has no PowerSync instance to talk to."
        );
      }

      return {
        endpoint,
        token: session.access_token,
        expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : undefined,
      };
    },

    async uploadData(database: CommonPowerSyncDatabase) {
      const batch = await database.getCrudBatch();
      if (!batch) return;

      // Same-origin request — the Supabase session cookie goes along
      // automatically (fetch's default `credentials: "same-origin"`), so
      // the route handler authenticates exactly the way every Server
      // Action in this app does, via src/lib/supabase/server.ts reading
      // next/headers cookies. No separate bearer-token path to keep in
      // sync with the cookie-based one.
      const response = await fetch("/api/offline/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: batch.crud.map(serializeCrudEntry) }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Sync upload failed (${response.status}): ${detail}`);
      }

      // The route processed the whole batch or none of it (any failure
      // rejects before this point) — drop the sync_pending markers for
      // whatever this batch just confirmed. sync_pending is local-only, so
      // this delete never itself becomes a queued write.
      for (const entry of batch.crud) {
        await database.execute(`DELETE FROM sync_pending WHERE id = ?`, [entry.id]);
      }

      await batch.complete();
    },
  };
}

function serializeCrudEntry(entry: CrudEntry) {
  return {
    id: entry.id,
    table: entry.table,
    op: entry.op,
    opData: entry.opData ?? null,
  };
}
