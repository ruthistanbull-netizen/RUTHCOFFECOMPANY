import { RuthieDockedQuickVoiceOrb } from "@/app/ruthie/RuthieDockedQuickVoiceOrb";
import { RuthieOrbDockSlot } from "@/app/ruthie/RuthieOrbDockSlot";
import { DashboardSessionSourceRingPatch } from "@/components/DashboardSessionSourceRingPatch";
import { DashboardSessionSourceSemanticColors } from "@/components/DashboardSessionSourceSemanticColors";
import { ExactOverviewDashboardV4 } from "@/components/base44-exact/ExactOverviewDashboardV4";

export default function DashboardPage() {
  return (
    <>
      <DashboardSessionSourceRingPatch />
      <DashboardSessionSourceSemanticColors />
      <ExactOverviewDashboardV4 />
      <RuthieOrbDockSlot />
      <RuthieDockedQuickVoiceOrb />
    </>
  );
}
