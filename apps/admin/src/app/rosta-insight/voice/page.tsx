import { RuthieMobileNavPolish } from "@/app/ruthie/RuthieMobileNavPolish";
import { RuthiePresentationBridge } from "@/app/ruthie/RuthiePresentationBridge";
import { RuthieVoiceExperience } from "@/app/ruthie/RuthieVoiceExperience";

export default function RostaInsightVoicePage() {
  return (
    <>
      <RuthieMobileNavPolish />
      <RuthieVoiceExperience />
      <RuthiePresentationBridge mode="voice" placement="experience" />
    </>
  );
}
