import { PatchQueue } from "@/modules/patches/screens/PatchQueue";
import { LocalPatchReview } from "@/modules/patches/screens/LocalPatchReview";
export default function PatchesPage() {
  return process.env.PATCHCTL_LEGACY_SERVER_CONTENT === "1" ? <PatchQueue /> : <LocalPatchReview />;
}
