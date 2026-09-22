import { ExactSelfHealHealth } from "@/components/base44-exact/ExactSelfHealHealth";
import { ExactServiceHealthTools } from "@/components/base44-exact/ExactServiceHealthTools";
import { ExactServiceHealthV2 } from "@/components/base44-exact/ExactServiceHealthV2";

export default function SystemPage() {
  return <>
    <ExactServiceHealthV2 />
    <ExactSelfHealHealth />
    <ExactServiceHealthTools />
  </>;
}
