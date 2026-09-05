import { describe, expect, it } from "vitest";
import { z } from "zod";
import { PromptRegistry, StaticPromptProvider, type PromptDefinition } from "../index";
import { promptDefinitions } from "../prompts";

const registry = new PromptRegistry([new StaticPromptProvider(promptDefinitions)]);

describe("PromptRegistry", () => {
  it("renders deterministically for the same prompt and variables", () => {
    const context = { environment: "dev" };
    const vars = { SOURCE_TEXT: "New SKU: Demo" };
    const first = registry.render("copilot.collect_inputs.description", context, vars);
    const second = registry.render("copilot.collect_inputs.description", context, vars);

    expect(first.content).toBe(second.content);
    expect(first.promptHash).toBe(second.promptHash);
  });

  it("validates variable schema", () => {
    const context = { environment: "dev", workspaceKind: "COMPANY" };
    expect(() =>
      registry.render("copilot.system", context as any, {})
    ).toThrow();
  });

  it("selects versions based on selection rules", () => {
    const definition: PromptDefinition = {
      id: "test.selection",
      description: "Test selection prompt",
      defaultVersion: "v1",
      versions: [
        {
          version: "v1",
          template: "v1",
          variablesSchema: z.object({}),
          variables: [],
        },
        {
          version: "v2",
          template: "v2",
          variablesSchema: z.object({}),
          variables: [],
        },
      ],
      selection: [
        {
          when: { workspaceKinds: ["COMPANY"] },
          version: "v2",
          priority: 10,
        },
      ],
    };

    const localRegistry = new PromptRegistry([new StaticPromptProvider([definition])]);

    const resolved = localRegistry.get("test.selection", {
      environment: "dev",
      workspaceKind: "COMPANY",
    });

    expect(resolved.version.version).toBe("v2");
  });
});
