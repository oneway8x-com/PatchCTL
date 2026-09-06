export type ProvisionedAccount = {
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  membership: {
    id: string;
    tenantId: string;
    roleId: string;
    tenant: {
      id: string;
      name: string;
    };
  };
};

export type ProvisionSignedInAccountInput = {
  email: string;
  userName?: string;
};

export interface AuthProvisioningRepository {
  resolveOrProvision(
    input: ProvisionSignedInAccountInput,
  ): Promise<ProvisionedAccount>;
}

export async function provisionSignedInAccount(
  repository: AuthProvisioningRepository,
  input: ProvisionSignedInAccountInput,
): Promise<ProvisionedAccount> {
  return repository.resolveOrProvision(input);
}
