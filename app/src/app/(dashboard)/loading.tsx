import { PageSkeleton } from "@/components/ui/skeleton";

/** Shown at once while the next dashboard page loads, instead of leaving the old page frozen. */
export default function Loading() {
  return <PageSkeleton />;
}
