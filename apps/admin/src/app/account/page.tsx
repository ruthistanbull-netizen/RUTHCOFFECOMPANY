import { ExactAccount } from "@/components/base44-exact/ExactAccount";
import { ExactAccountLogout } from "@/components/base44-exact/ExactAccountLogout";

export default function AccountPage() {
  return (
    <div className="space-y-4">
      <ExactAccount />
      <ExactAccountLogout />
    </div>
  );
}
