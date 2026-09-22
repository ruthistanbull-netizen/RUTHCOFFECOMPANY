"use client";

import { ExactManualOrder } from "./ExactManualOrder";

export function ExactManualOrderHost({
  onOrderCreated,
  onOpenCreatedOrder,
  hideNeighborhood = true,
}: {
  onOrderCreated?: () => void;
  onOpenCreatedOrder?: () => void;
  hideNeighborhood?: boolean;
}) {
  return (
    <ExactManualOrder
      hideNeighborhood={hideNeighborhood}
      onOrderCreated={onOrderCreated}
      onOpenCreatedOrder={onOpenCreatedOrder}
    />
  );
}
