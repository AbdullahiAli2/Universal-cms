import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/** Page numbers with gaps, e.g. 1 2 3 4 … 140 for page 1, or 1 … 9 10 11 … 140 in the middle. */
function pageList(page: number, pages: number): (number | "gap")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  const around = [page - 1, page, page + 1].filter((value) => value > 1 && value < pages);
  const head = page <= 3 ? [2, 3, 4] : [];
  const tail = page >= pages - 2 ? [pages - 3, pages - 2, pages - 1] : [];
  const middle = [...new Set([...head, ...around, ...tail])].sort((a, b) => a - b);
  const list: (number | "gap")[] = [1];
  for (const value of middle) {
    if (value - (list[list.length - 1] as number) > 1) list.push("gap");
    list.push(value);
  }
  if (pages - middle[middle.length - 1] > 1) list.push("gap");
  list.push(pages);
  return list;
}

/** "Showing 1 to 50 of 7,011" with Previous, numbered pages and Next. */
export function Pagination({
  page,
  pageSize,
  count,
  onChange,
  noun = "entries",
}: {
  page: number;
  pageSize: number;
  count: number;
  onChange: (page: number) => void;
  noun?: string;
}) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const first = count === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(count, page * pageSize);
  const button = "inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-2 text-sm transition-colors";

  return (
    <nav aria-label="Pages" className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 sm:flex-row">
      <p className="text-sm text-muted-foreground">
        Showing {first.toLocaleString()} to {last.toLocaleString()} of {count.toLocaleString()} {noun}
      </p>
      {pages > 1 ? (
        <div className="flex items-center gap-1">
          <button type="button" className={cn(button, "text-muted-foreground hover:bg-surface-muted disabled:opacity-40")} disabled={page <= 1} onClick={() => onChange(page - 1)}>
            <ChevronLeft className="size-4" /> Previous
          </button>
          {pageList(page, pages).map((item, index) =>
            item === "gap" ? (
              <span key={`gap-${index}`} className="px-1 text-muted-foreground" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                aria-current={item === page ? "page" : undefined}
                onClick={() => onChange(item)}
                className={cn(button, item === page ? "border border-border bg-surface-muted font-semibold shadow-xs" : "hover:bg-surface-muted")}
              >
                {item.toLocaleString()}
              </button>
            ),
          )}
          <button type="button" className={cn(button, "hover:bg-surface-muted disabled:opacity-40")} disabled={page >= pages} onClick={() => onChange(page + 1)}>
            Next <ChevronRight className="size-4" />
          </button>
        </div>
      ) : null}
    </nav>
  );
}
