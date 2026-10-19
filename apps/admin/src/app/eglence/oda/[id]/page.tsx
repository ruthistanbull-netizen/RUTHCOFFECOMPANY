import type { Metadata } from "next";
import WatchRoomView from "@/components/entertainment/WatchRoomView";
export const metadata: Metadata = { title: "Eğlence • Birlikte izle", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WatchRoomView roomId={id} />;
}
