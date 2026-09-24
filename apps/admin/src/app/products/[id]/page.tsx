import { redirect } from "next/navigation";

export default async function ProductDetailAliasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/products?q=${encodeURIComponent(id)}`);
}
