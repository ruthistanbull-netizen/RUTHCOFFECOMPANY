import { redirect } from "next/navigation";

export default async function CustomerDetailAliasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/customers?q=${encodeURIComponent(id)}`);
}
