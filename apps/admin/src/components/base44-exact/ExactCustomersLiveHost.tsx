"use client";

import { useAcceptedAdminResourceRevision } from "@/lib/useAcceptedAdminResourceRevision";
import { ExactCustomers } from "./ExactCustomers";

export function ExactCustomersLiveHost() {
  const revision = useAcceptedAdminResourceRevision("customers");
  return (
    <div style={{ display: "contents" }} data-customers-live-revision={revision}>
      <ExactCustomers />
    </div>
  );
}
