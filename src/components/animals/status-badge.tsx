import { Badge } from "@/components/ui/badge";
import { PIG_STATUS_LABELS } from "@/lib/labels";
import type { AnimalStatus } from "@prisma/client";

const VARIANTS: Record<AnimalStatus, "default" | "success" | "warning" | "danger"> = {
  ACTIVE: "success",
  SOLD: "default",
  RETIRED: "default",
  CULLED: "warning",
  DECEASED: "danger",
};

export function AnimalStatusBadge({ status }: { status: AnimalStatus }) {
  return <Badge variant={VARIANTS[status]}>{PIG_STATUS_LABELS[status]}</Badge>;
}
