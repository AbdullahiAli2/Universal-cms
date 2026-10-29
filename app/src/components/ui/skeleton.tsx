import { cn } from "@/lib/utils";

/** A grey placeholder shaped like the content that is loading. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-surface-muted", className)} />;
}

/** Placeholder for a whole page: header, a row of tiles and two panels. */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="grid gap-6">
      <div className="grid gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
