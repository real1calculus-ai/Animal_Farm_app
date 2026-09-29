"use client";

import { PowerSyncDatabase } from "@powersync/web";
import { AppSchema } from "@/lib/offline/schema";
import { createPowerSyncConnector } from "@/lib/offline/connector";

let instance: PowerSyncDatabase | undefined;

/**
 * One local database per browser tab/native WebView, created lazily so
 * nothing touches IndexedDB/wa-sqlite during server rendering — this file
 * is only ever imported from "use client" components.
 */
export function getPowerSyncDb(): PowerSyncDatabase {
  if (!instance) {
    instance = new PowerSyncDatabase({
      schema: AppSchema,
      database: { dbFilename: "pigfarm-offline.db" },
    });
    // Fire-and-forget: PowerSync queues local reads/writes regardless of
    // connection state, so nothing here needs to await this. Errors surface
    // through useStatus() in the UI rather than an unhandled rejection.
    instance.connect(createPowerSyncConnector()).catch((error) => {
      console.error("PowerSync connect failed", error);
    });
  }
  return instance;
}
