"use client";

import Link from "next/link";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@corely/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md rounded-[2rem] border-border/70 bg-background/90">
        <CardHeader>
          <CardTitle>Page not found</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This Next.js app is the first migration slice. The route you asked for does not exist
            yet.
          </p>
          <Button asChild>
            <Link href="/todos">Go to todos</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
