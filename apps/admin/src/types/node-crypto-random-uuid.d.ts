import "node:crypto";

declare module "node:crypto" {
  /**
   * Node 22 types expose randomUUID as a UUID template-literal type.
   * ROSTA Insight stores idempotency keys as ordinary strings, so keep the public
   * contract widened to string to allow values read back from persistence.
   */
  export function randomUUID(options?: { disableEntropyCache?: boolean }): string;
}
