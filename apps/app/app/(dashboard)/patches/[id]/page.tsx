import { PatchDetail } from "@/modules/patches/screens/PatchDetail";
import { LocalPatchReview } from "@/modules/patches/screens/LocalPatchReview";
export default async function PatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = (await params).id;
  return process.env.PATCHCTL_LEGACY_SERVER_CONTENT === "1" ? <PatchDetail id={id} /> : <LocalPatchReview id={id} />;
}
