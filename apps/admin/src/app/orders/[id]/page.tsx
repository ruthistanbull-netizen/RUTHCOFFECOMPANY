import { DirectOrderDetailUiFix } from "@/components/orders/DirectOrderDetailUiFix";
import { ExactOrderDetailPage } from "@/components/orders/ExactOrderDetailPage";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <>
    <DirectOrderDetailUiFix />
    <ExactOrderDetailPage orderId={id} />
  </>;
}
