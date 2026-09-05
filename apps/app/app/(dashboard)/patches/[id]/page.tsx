import { PatchDetail } from "@/modules/patches/screens/PatchDetail";
export default async function PatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <PatchDetail id={(await params).id} />;
}
