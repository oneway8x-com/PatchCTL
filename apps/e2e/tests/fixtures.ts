import { test as base, expect } from "@playwright/test";
import { seedUserWorkspace, type SeededSession } from "./helpers/auth";

type Fixtures = {
  session: SeededSession;
};

export const test = base.extend<Fixtures>({
  session: async ({ request }, use) => {
    const session = await seedUserWorkspace(request);
    await use(session);
  },
});

export { expect };
