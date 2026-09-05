import { TodoDetailPage } from "@/modules/todos/screens/TodoDetailPage";

export default async function TodoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <TodoDetailPage id={id} />;
}
