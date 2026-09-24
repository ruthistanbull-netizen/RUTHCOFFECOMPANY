import { CoreListDataGate } from "@/components/CoreListDataGate";
import { CoreLivePageGate } from "@/components/CoreLivePageGate";
import { ExactCustomers } from "@/components/base44-exact/ExactCustomers";

export default function CustomersPage() {
  return (
    <CoreLivePageGate cacheMatch="/api/customers" label="müşteriler">
      <CoreListDataGate kind="customers" label="müşteriler">
        <ExactCustomers />
      </CoreListDataGate>
    </CoreLivePageGate>
  );
}
