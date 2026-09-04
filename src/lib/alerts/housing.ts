import { prisma } from "@/lib/prisma";
import { daysBetween, formatDate } from "@/lib/format";
import { listPenOccupancy } from "@/lib/db/pens";
import { listMaintenanceDue } from "@/lib/db/equipment";
import type { Alert } from "@/lib/alerts/types";

export async function housingAlerts(farmId: string, now: Date): Promise<Alert[]> {
  const alerts: Alert[] = [];

  const pens = await listPenOccupancy(farmId, { asOf: now });

  for (const pen of pens) {
    if (pen.isOverCapacity) {
      alerts.push({
        key: `pen-over-capacity:${pen.id}`,
        severity: "WARNING",
        title: "Pen over capacity",
        detail: `${pen.name} holds ${pen.occupancy} animals against a capacity of ${pen.capacity} — ${pen.overCapacityBy} too many.`,
        href: `/pens/${pen.id}`,
        family: "HOUSING",
      });
    }

    // Only flag pens that actually hold animals. An empty pen nobody has
    // cleaned is not a biosecurity risk until something is put in it, and
    // flagging it just trains people to ignore the panel.
    if (pen.occupancy === 0) continue;

    if (pen.neverCleaned) {
      alerts.push({
        key: `pen-never-cleaned:${pen.id}`,
        severity: "WARNING",
        title: "Pen never cleaned",
        detail: `${pen.name} holds ${pen.occupancy} animals and has no cleaning or disinfection on record.`,
        href: `/pens/${pen.id}`,
        family: "HOUSING",
      });
    } else if (pen.biosecurityOverdue && pen.nextBiosecurityDueAt) {
      const overdueBy = daysBetween(pen.nextBiosecurityDueAt, now);
      alerts.push({
        key: `pen-cleaning-overdue:${pen.id}`,
        severity: "INFO",
        title: "Pen cleaning overdue",
        detail: `${pen.name} was due for cleaning on ${formatDate(pen.nextBiosecurityDueAt)}, ${overdueBy} day${overdueBy === 1 ? "" : "s"} ago.`,
        href: `/pens/${pen.id}`,
        family: "HOUSING",
      });
    }
  }

  const due = await listMaintenanceDue(farmId, now);

  for (const item of due) {
    alerts.push({
      key: `maintenance:${item.id}`,
      severity: item.maintenanceState === "OVERDUE" ? "WARNING" : "INFO",
      title: item.maintenanceState === "OVERDUE" ? "Maintenance overdue" : "Maintenance due soon",
      detail: `${item.name}${item.nextDueAt ? ` — due ${formatDate(item.nextDueAt)}` : ""}.`,
      href: `/equipment/${item.id}`,
      family: "HOUSING",
    });
  }

  const needsRepair = await prisma.equipment.findMany({
    where: { farmId, status: "NEEDS_REPAIR" },
    select: { id: true, name: true, notes: true },
    take: 15,
  });

  for (const item of needsRepair) {
    alerts.push({
      key: `equipment-broken:${item.id}`,
      severity: "INFO",
      title: "Equipment needs repair",
      detail: `${item.name}${item.notes ? ` — ${item.notes}` : ""}`,
      href: `/equipment/${item.id}`,
      family: "HOUSING",
    });
  }

  return alerts;
}
