import { Badge } from "@/components/ui/badge";
import { ENTRY_STATUSES, type EntryStatus } from "@/lib/types";

const VARIANTS: Record<EntryStatus, "default" | "accent" | "success" | "warning"> = {
  draft: "default",
  in_review: "warning",
  scheduled: "accent",
  published: "success",
  archived: "default",
};

export function StatusBadge({ status }: { status: EntryStatus }) {
  return (
    <Badge variant={VARIANTS[status]} className="gap-1.5">
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {ENTRY_STATUSES.find((item) => item.value === status)?.label ?? status}
    </Badge>
  );
}
