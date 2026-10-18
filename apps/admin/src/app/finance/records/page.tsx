import { FinanceRecords } from "@/components/finance/FinanceRecords";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const initialFilters = Object.fromEntries(
    Object.entries(params).filter(
      (e): e is [string, string] => typeof e[1] === "string",
    ),
  );
  return <FinanceRecords initialFilters={initialFilters} />;
}
