import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">The page you asked for does not exist or you do not have access.</p>
      <Button asChild>
        <Link href="/">Back to websites</Link>
      </Button>
    </div>
  );
}
