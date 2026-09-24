import { RuthieMobileNavPolish } from "../RuthieMobileNavPolish";
import { RuthiePresentationBridge } from "../RuthiePresentationBridge";
import { RuthieVoiceExperience } from "../RuthieVoiceExperience";

export default function RuthieVoicePage() {
  return (
    <>
      <RuthieMobileNavPolish />
      <RuthieVoiceExperience />
      <RuthiePresentationBridge mode="voice" placement="experience" />
    </>
  );
}
