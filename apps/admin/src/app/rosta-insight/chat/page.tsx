import { RuthieChatExperience } from "@/app/ruthie/RuthieChatExperience";
import { RuthieMobileNavPolish } from "@/app/ruthie/RuthieMobileNavPolish";
import { RuthiePresentationBridge } from "@/app/ruthie/RuthiePresentationBridge";
import { RuthieUnifiedAgentBridge } from "@/app/ruthie/RuthieUnifiedAgentBridge";
import { RuthieChatComposerEnhancerV3 } from "@/app/ruthie/chat/RuthieChatComposerEnhancerV3";

export default function RostaInsightChatPage() {
  return (
    <>
      <RuthieMobileNavPolish />
      <RuthieUnifiedAgentBridge />
      <RuthieChatExperience />
      <RuthieChatComposerEnhancerV3 />
      <RuthiePresentationBridge mode="chat" placement="experience" />
    </>
  );
}
