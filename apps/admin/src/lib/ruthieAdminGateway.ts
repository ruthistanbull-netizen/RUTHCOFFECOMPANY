import {
  invokeRuthieAdminAction as invokeRuthieAdminActionBase,
} from "@/lib/ruthieAdminGatewayV2";
import { normalizeRuthieSpeechData } from "@/lib/ruthieSpeechNormalization";

export * from "@/lib/ruthieAdminGatewayV2";

export async function invokeRuthieAdminAction(
  options: Parameters<typeof invokeRuthieAdminActionBase>[0],
): Promise<Awaited<ReturnType<typeof invokeRuthieAdminActionBase>>> {
  const result = await invokeRuthieAdminActionBase(options);
  if (result.data === undefined) return result;
  return {
    ...result,
    data: normalizeRuthieSpeechData(result.data),
  };
}
