import { Facebook, Instagram, Linkedin, MessageCircle, Youtube } from "lucide-react";
import type { SocialMediaPlatform } from "@ruth-commerce/contracts/social-media";

export function SocialMediaIcon({
  platform,
  className = "h-5 w-5",
}: {
  platform: SocialMediaPlatform;
  className?: string;
}) {
  if (platform === "instagram") return <Instagram className={className} aria-hidden="true" />;
  if (platform === "facebook") return <Facebook className={className} aria-hidden="true" />;
  if (platform === "youtube") return <Youtube className={className} aria-hidden="true" />;
  if (platform === "linkedin") return <Linkedin className={className} aria-hidden="true" />;
  if (platform === "whatsapp") return <MessageCircle className={className} aria-hidden="true" />;

  if (platform === "tiktok") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 4v10.2a4.2 4.2 0 1 1-3.3-4.1" />
        <path d="M14 4c.7 3 2.6 4.8 5.4 5.2" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M5 4l14 16M19 4L5 20" />
    </svg>
  );
}
