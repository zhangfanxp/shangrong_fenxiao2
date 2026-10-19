export type ContractAction = "query" | "create" | "view" | "edit" | "activate" | "terminate" | "import";

export function canContractAction(permissions: string[], action: ContractAction) {
  return permissions.includes("*") || permissions.includes("stores:contracts:view") || permissions.includes(`stores:contracts:${action}`);
}
