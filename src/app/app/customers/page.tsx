import type { Metadata } from "next";
import { CustomerTable } from "@/components/customer-table";
import { formatMetricValue } from "@/lib/format";
import { getCustomersList } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Customers",
};

export default function CustomersPage() {
  const customers = getCustomersList();
  const active = customers.filter((c) => c.status === "active");
  const totalMrr = active.reduce((s, c) => s + c.mrr, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <p className="text-sm text-muted-foreground">
          {active.length} active accounts worth{" "}
          {formatMetricValue(totalMrr, "currency")} MRR,{" "}
          {customers.length - active.length} churned. Click a row for the full
          account picture.
        </p>
      </div>
      <CustomerTable customers={customers} />
    </div>
  );
}
