import { POST as postChat } from "../../openai/chat/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = postChat;
