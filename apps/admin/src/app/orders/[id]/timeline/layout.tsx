import type { ReactNode } from "react";
import { ExactOrderTimeline } from "@/components/base44-exact/ExactOrderTimeline";

export default async function OrderTimelineLayout({
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExactOrderTimeline orderId={id} />;
}
