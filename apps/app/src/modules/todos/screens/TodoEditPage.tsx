"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  useToast,
} from "@corely/ui";
import type { CreateTodoInput, TodoPriority, TodoStatus, UpdateTodoInput } from "@corely/contracts";
import { ChevronLeft, Loader2 } from "lucide-react";
import { createTodo, fetchTodo, updateTodo } from "../todos-api";

export function TodoEditPage({ id }: { id?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isNew = !id;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TodoPriority>("medium");
  const [status, setStatus] = useState<TodoStatus>("open");
  const [dueDate, setDueDate] = useState("");

  const { data: todo, isLoading } = useQuery({
    queryKey: ["todos", id],
    queryFn: () => fetchTodo(id!),
    enabled: !isNew,
  });

  useEffect(() => {
    if (!todo) {
      return;
    }

    setTitle(todo.title);
    setDescription(todo.description || "");
    setPriority(todo.priority);
    setStatus(todo.status);
    setDueDate(todo.dueDate ? todo.dueDate.split("T")[0] : "");
  }, [todo]);

  const mutation = useMutation({
    mutationFn: async () => {
      const basePayload = {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        dueDate: dueDate || undefined,
      };

      if (isNew) {
        return createTodo(basePayload satisfies CreateTodoInput);
      }

      return updateTodo(
        id!,
        {
          ...basePayload,
          status,
        } satisfies UpdateTodoInput
      );
    },
    onSuccess: async (savedTodo) => {
      await queryClient.invalidateQueries({ queryKey: ["todos"] });
      await queryClient.invalidateQueries({ queryKey: ["todos", savedTodo.id] });
      toast({ title: isNew ? "Task created" : "Task updated" });
      router.push(isNew ? `/todos/${savedTodo.id}` : `/todos/${id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Action failed",
        description: error.message || "The task could not be saved.",
        variant: "destructive",
      });
    },
  });

  if (!isNew && isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" onClick={() => router.push("/todos")} className="-ml-4">
        <ChevronLeft className="mr-1 h-4 w-4" />
        Back to tasks
      </Button>

      <Card className="rounded-[2rem] border-border/70 bg-background/85 shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl">{isNew ? "Create a new task" : "Edit task"}</CardTitle>
          <p className="text-sm text-muted-foreground">
            This form already saves through the new in-app route handlers.
          </p>
        </CardHeader>

        <CardContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate();
            }}
            className="space-y-5"
          >
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                placeholder="What needs to be done?"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional notes, links, or next steps"
                rows={5}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select value={priority} onValueChange={(value) => setPriority(value as TodoPriority)}>
                  <SelectTrigger id="priority" aria-label="Priority">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dueDate">Due date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </div>
            </div>

            {!isNew ? (
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as TodoStatus)}>
                  <SelectTrigger id="status" aria-label="Status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={() => router.push("/todos")}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending || !title.trim()}>
                {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isNew ? "Create task" : "Save changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
