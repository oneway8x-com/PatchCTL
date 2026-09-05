"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, useToast } from "@corely/ui";
import { Calendar, CheckCircle2, ChevronLeft, Circle, Loader2, Trash2 } from "lucide-react";
import { completeTodo, deleteTodo, fetchTodo, reopenTodo } from "../todos-api";

export function TodoDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: todo, isLoading } = useQuery({
    queryKey: ["todos", id],
    queryFn: () => fetchTodo(id),
  });

  const completeMutation = useMutation({
    mutationFn: completeTodo,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["todos"] });
      await queryClient.invalidateQueries({ queryKey: ["todos", id] });
      toast({ title: "Task completed" });
    },
  });

  const reopenMutation = useMutation({
    mutationFn: reopenTodo,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["todos"] });
      await queryClient.invalidateQueries({ queryKey: ["todos", id] });
      toast({ title: "Task reopened" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTodo,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["todos"] });
      toast({ title: "Task deleted", variant: "destructive" });
      router.push("/todos");
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!todo) {
    return <div className="p-8 text-center text-muted-foreground">Task not found.</div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => router.push("/todos")} className="-ml-4">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to tasks
        </Button>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/todos/${todo.id}/edit`)}>
            Edit
          </Button>
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              if (!window.confirm(`Delete "${todo.title}"?`)) {
                return;
              }
              deleteMutation.mutate(todo.id);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card className="rounded-[2rem] border-border/70 bg-background/85 shadow-sm">
        <CardHeader className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={todo.status === "done" ? "default" : "secondary"}>
                {todo.status === "done" ? "Completed" : "Open"}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {todo.priority}
              </Badge>
            </div>
            <CardTitle className="text-3xl tracking-tight">{todo.title}</CardTitle>
          </div>

          <Button
            size="lg"
            variant={todo.status === "done" ? "outline" : "default"}
            disabled={completeMutation.isPending || reopenMutation.isPending}
            onClick={() =>
              todo.status === "done"
                ? reopenMutation.mutate(todo.id)
                : completeMutation.mutate(todo.id)
            }
          >
            {todo.status === "done" ? (
              <>
                <Circle className="mr-2 h-4 w-4" />
                Reopen
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Complete
              </>
            )}
          </Button>
        </CardHeader>

        <CardContent className="space-y-8">
          <div className="rounded-[1.5rem] border border-border/70 bg-muted/40 p-5">
            <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/85">
              {todo.description || "No additional description."}
            </p>
          </div>

          <div className="grid gap-4 border-t border-border/60 pt-6 md:grid-cols-2">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>
                Due {todo.dueDate ? new Date(todo.dueDate).toLocaleDateString() : "whenever"}
              </span>
            </div>
            <div className="text-sm text-muted-foreground md:text-right">
              Created {new Date(todo.createdAt).toLocaleDateString()}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
