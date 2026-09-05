"use client";

import { useDeferredValue, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToast,
} from "@corely/ui";
import { CheckCircle2, Circle, Plus, Search, Trash2 } from "lucide-react";
import type { TodoDto } from "@corely/contracts";
import { completeTodo, deleteTodo, fetchTodos, reopenTodo } from "../todos-api";

const priorityStyles = {
  low: "bg-blue-100 text-blue-800 border-blue-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  high: "bg-rose-100 text-rose-800 border-rose-200",
} as const;

type StatusFilter = "all" | "open" | "done";

export function TodosListPage() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const deferredSearch = useDeferredValue(search);

  const { data, isLoading } = useQuery({
    queryKey: ["todos", deferredSearch, status],
    queryFn: () =>
      fetchTodos({
        page: 1,
        pageSize: 100,
        q: deferredSearch.trim() || undefined,
        status: status === "all" ? undefined : status,
      }),
  });

  const completeMutation = useMutation({
    mutationFn: completeTodo,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["todos"] });
      toast({ title: "Task completed" });
    },
  });

  const reopenMutation = useMutation({
    mutationFn: reopenTodo,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["todos"] });
      toast({ title: "Task reopened" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTodo,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["todos"] });
      toast({ title: "Task deleted", variant: "destructive" });
    },
  });

  const items = data?.items ?? [];
  const openCount = items.filter((todo) => todo.status === "open").length;
  const doneCount = items.filter((todo) => todo.status === "done").length;

  const toggleTodo = (todo: TodoDto) => {
    if (todo.status === "done") {
      reopenMutation.mutate(todo.id);
      return;
    }

    completeMutation.mutate(todo.id);
  };

  const removeTodo = (todo: TodoDto) => {
    if (!window.confirm(`Delete "${todo.title}"?`)) {
      return;
    }

    deleteMutation.mutate(todo.id);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-border/70 bg-background/80 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              First shared module slice
            </Badge>
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">Todos on the Next runtime</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                This page runs inside the new App Router app and talks to `app/api/todos`, backed
                by the extracted `@corely/modules-todos` package.
              </p>
            </div>
          </div>

          <Button size="lg" onClick={() => router.push("/todos/new")}>
            <Plus className="mr-2 h-4 w-4" />
            Create task
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card className="rounded-[1.75rem] border-border/70 bg-background/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{openCount}</p>
          </CardContent>
        </Card>
        <Card className="rounded-[1.75rem] border-border/70 bg-background/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Done</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{doneCount}</p>
          </CardContent>
        </Card>
      </section>

      <Card className="rounded-[2rem] border-border/70 bg-background/85 shadow-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search tasks"
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {(["all", "open", "done"] as const).map((option) => (
                <Button
                  key={option}
                  type="button"
                  variant={status === option ? "default" : "outline"}
                  onClick={() => setStatus(option)}
                  className="capitalize"
                >
                  {option}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((todo) => (
                <TableRow key={todo.id}>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleTodo(todo)}
                      disabled={completeMutation.isPending || reopenMutation.isPending}
                      aria-label={
                        todo.status === "done"
                          ? `Reopen ${todo.title}`
                          : `Mark ${todo.title} as complete`
                      }
                    >
                      {todo.status === "done" ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Link href={`/todos/${todo.id}`} className="font-medium hover:underline">
                        {todo.title}
                      </Link>
                      {todo.description ? (
                        <p className="line-clamp-1 text-sm text-muted-foreground">
                          {todo.description}
                        </p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={priorityStyles[todo.priority]}>
                      {todo.priority}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {todo.dueDate ? new Date(todo.dueDate).toLocaleDateString() : "No deadline"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/todos/${todo.id}/edit`}>Edit</Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeTodo(todo)}
                        aria-label={`Delete ${todo.title}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}

              {!items.length && !isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                    No tasks found. Create the first task in the new app.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
