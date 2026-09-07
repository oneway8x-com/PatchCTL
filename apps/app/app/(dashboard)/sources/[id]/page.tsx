import { SourceConfiguration } from "@/modules/patches";

export default async function SourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <SourceConfiguration sourceId={(await params).id} />;
}
