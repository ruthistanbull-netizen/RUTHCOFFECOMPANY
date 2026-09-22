import { redirect } from "next/navigation";

export default async function ProductionQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = new URLSearchParams({ queue: "preparing" });
  const order = typeof params.order === "string" ? params.order : "";
  if (order) next.set("order", order);
  redirect(`/orders?${next.toString()}`);
}
