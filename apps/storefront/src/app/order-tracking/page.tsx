import { OrderTrackingClient } from "./OrderTrackingClient";

export const metadata = {
  title: "Sipariş Takip",
  description: "ROSTA Coffee Co. sipariş takip sayfası.",
};

export default function OrderTrackingPage() {
  return <OrderTrackingClient />;
}
