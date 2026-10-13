import { StoreH5EmployeeCreate } from "@/components/store-h5-employee-create";
import { requireStoreH5PageSession } from "@/lib/store-h5-auth";

export default async function StoreH5EmployeeCreatePage() {
  await requireStoreH5PageSession("store-h5:my-store:employees:create");
  return <StoreH5EmployeeCreate />;
}
