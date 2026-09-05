import { TodoEditPage } from "@/modules/todos/screens/TodoEditPage";

export default async function EditTodoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <TodoEditPage id={id} />;
}
