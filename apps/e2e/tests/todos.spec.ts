import { createTodo } from "./helpers/todo-fixtures";
import { gotoTodos } from "./helpers/auth";
import { expect, test } from "./fixtures";

test.describe("Todo module", () => {
  test("creates a new todo from the UI", async ({ page, session }) => {
    await gotoTodos(page, session);

    await expect(page.getByTestId("todos-empty-state")).toBeVisible();

    await page.getByRole("button", { name: "New Task" }).click();
    await expect(page.getByRole("heading", { name: "New Task" })).toBeVisible();

    await page.getByLabel("Title").fill("Ship March roadmap");
    await page.getByLabel("Description").fill("Align product, engineering, and rollout milestones.");
    await page.getByRole("combobox", { name: "Priority" }).click();
    await page.getByRole("option", { name: "High" }).click();
    await page.getByLabel("Due Date").fill("2026-03-31");
    await page.getByRole("button", { name: "Create Task" }).click();

    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
    await expect(page.getByText("Ship March roadmap")).toBeVisible();
    await expect(page.getByText("Align product, engineering, and rollout milestones.")).toBeVisible();
    await expect(page.getByText("High")).toBeVisible();
    await expect(page.getByText("2026-03-31")).toBeVisible();
  });

  test("completes and reopens a todo from the list", async ({ page, request, session }) => {
    const todo = await createTodo(request, session, {
      title: "Review payroll exports",
      priority: "medium",
    });

    await gotoTodos(page, session);

    const row = page.getByTestId(`todo-row-${todo.id}`);
    await expect(row).toContainText("Review payroll exports");

    await page.getByLabel(`Mark Review payroll exports as complete`).click();
    await expect(page.getByText("Todo completed", { exact: true })).toBeVisible();
    await expect(row.getByText("Review payroll exports")).toHaveClass(/line-through/);

    await page.getByLabel(`Reopen Review payroll exports`).click();
    await expect(page.getByText("Todo reopened", { exact: true })).toBeVisible();
    await expect(row.getByText("Review payroll exports")).not.toHaveClass(/line-through/);
  });

  test("edits and deletes a todo from the list", async ({ page, request, session }) => {
    const todo = await createTodo(request, session, {
      title: "Draft investor update",
      description: "Initial draft",
      priority: "low",
    });

    await gotoTodos(page, session);

    await page.getByLabel(`Edit Draft investor update`).click();
    await expect(page.getByRole("heading", { name: "Edit Task" })).toBeVisible();

    await page.getByLabel("Title").fill("Draft investor update v2");
    await page.getByLabel("Description").fill("Updated with revenue and runway metrics.");
    await page.getByRole("combobox", { name: "Priority" }).click();
    await page.getByRole("option", { name: "High" }).click();
    await page.getByRole("combobox", { name: "Status" }).click();
    await page.getByRole("option", { name: "Done" }).click();
    await page.getByRole("button", { name: "Save Changes" }).click();

    const updatedRow = page.getByTestId(`todo-row-${todo.id}`);
    await expect(updatedRow).toContainText("Draft investor update v2");
    await expect(updatedRow).toContainText("Updated with revenue and runway metrics.");
    await expect(updatedRow).toContainText("High");
    await expect(updatedRow.getByText("Draft investor update v2")).toHaveClass(/line-through/);

    await page.getByLabel(`Delete Draft investor update v2`).click();
    await expect(page.getByText("Todo deleted", { exact: true })).toBeVisible();
    await expect(page.getByText("Draft investor update v2")).toHaveCount(0);
  });
});
