"use client";

import Link from "next/link";
import { Badge } from "@corely/ui";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="container flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <Link href="/todos" className="text-lg font-semibold tracking-tight">
              Corely App
            </Link>
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              Next.js migration
            </Badge>
          </div>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/todos">Todos</Link>
            <Link href="/login">Auth</Link>
          </nav>
        </div>
      </header>
      <main className="container py-8">{children}</main>
    </div>
  );
}
