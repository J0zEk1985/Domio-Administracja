export type ProductModuleSlug = "cleaning" | "serwis" | "flota" | "administracja" | "home";

type ModuleAccessRpcClient = {
  rpc: (
    fn: "user_has_module_access",
    args: { p_module_slug: string },
  ) => PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
};

export async function userHasModuleAccess(
  client: unknown,
  moduleSlug: ProductModuleSlug,
): Promise<boolean> {
  const rpcClient = client as ModuleAccessRpcClient;
  const { data, error } = await rpcClient.rpc("user_has_module_access", {
    p_module_slug: moduleSlug,
  });
  if (error) {
    console.error("[moduleAccess] user_has_module_access:", error.message);
    return false;
  }
  return data === true;
}
