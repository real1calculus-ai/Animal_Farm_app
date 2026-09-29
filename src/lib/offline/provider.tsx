"use client";

import { useState, type ReactNode } from "react";
import { PowerSyncContext } from "@powersync/react";
import { getPowerSyncDb } from "@/lib/offline/db";

/**
 * Wraps the offline-capable routes only (not the whole app — most screens
 * still read straight from the server, see docs/offline-first.md). Mounted
 * per-subtree rather than in the root layout so the rest of the app never
 * pays for a local SQLite connection it doesn't use.
 */
export function OfflineProvider({ children }: { children: ReactNode }) {
  const [db] = useState(() => getPowerSyncDb());
  return <PowerSyncContext.Provider value={db}>{children}</PowerSyncContext.Provider>;
}
