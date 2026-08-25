import { StoreH5Home } from "@/components/store-h5-home";
import { requireStoreH5PageSession } from "@/lib/store-h5-auth";

export default async function StoreH5Page() {
  const session = await requireStoreH5PageSession();
  return <StoreH5Home realName={session.realName} storeName={session.storeName} />;
}
