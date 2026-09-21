import type { SearchResult } from "@ruth-commerce/contracts";

export interface SearchMatchField {
  field: string;
  value?: string | null;
  weight?: number;
}

export interface SearchCandidate<TEntity> {
  id: string;
  entityType: string;
  title: string;
  subtitle?: string;
  fields: SearchMatchField[];
  entity: TEntity;
  createdAt?: string;
}

export interface RankedSearchResult<TEntity> extends SearchResult<TEntity> {
  createdAt?: string;
}

interface SearchCursorPayload {
  score: number;
  createdAt: string;
  id: string;
}

const TURKISH_CHARACTERS: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
};

function replaceTurkishCharacters(value: string): string {
  return value.replace(/[çğıöşü]/g, (character) => TURKISH_CHARACTERS[character] ?? character);
}

export function normalizeSearchText(value: unknown): string {
  return replaceTurkishCharacters(String(value ?? "").trim().toLocaleLowerCase("tr-TR"))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9@.+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactSearchText(value: string): string {
  return value.replace(/[^a-z0-9]+/g, "");
}

function scoreField(query: string, value: string, weight: number): number {
  if (!value) return 0;
  const compactQuery = compactSearchText(query);
  const compactValue = compactSearchText(value);
  const queryTokens = query.split(" ").filter(Boolean);
  const allTokensMatch = queryTokens.length > 1 && queryTokens.every((token) => value.includes(token));

  if (value === query || (compactQuery.length >= 4 && compactValue === compactQuery)) return 1_000 + weight;
  if (value.startsWith(query) || (compactQuery.length >= 4 && compactValue.startsWith(compactQuery))) return 760 + weight;
  if (value.includes(query) || (compactQuery.length >= 4 && compactValue.includes(compactQuery))) return 520 + weight;
  if (allTokensMatch) return 400 + weight;
  return 0;
}

export function rankSearchCandidates<TEntity>(
  query: string,
  candidates: SearchCandidate<TEntity>[],
): RankedSearchResult<TEntity>[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const ranked: RankedSearchResult<TEntity>[] = [];
  for (const candidate of candidates) {
    const scoredFields = candidate.fields
      .map((field) => {
        const normalizedValue = normalizeSearchText(field.value);
        return {
          field: field.field,
          originalValue: String(field.value ?? "").trim(),
          score: scoreField(normalizedQuery, normalizedValue, Math.max(0, Math.trunc(field.weight ?? 0))),
        };
      })
      .filter((field) => field.score > 0)
      .sort((left, right) => right.score - left.score);

    if (scoredFields.length === 0) continue;
    const secondaryScore = scoredFields.slice(1, 3).reduce((total, field) => total + Math.round(field.score * 0.08), 0);
    const highlights = Object.fromEntries(
      scoredFields.map((field) => [field.field, [field.originalValue]]),
    );

    ranked.push({
      id: candidate.id,
      entityType: candidate.entityType,
      title: candidate.title,
      ...(candidate.subtitle ? { subtitle: candidate.subtitle } : {}),
      score: scoredFields[0].score + secondaryScore,
      highlights,
      entity: candidate.entity,
      ...(candidate.createdAt ? { createdAt: candidate.createdAt } : {}),
    });
  }

  return ranked.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    const createdCompare = String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? ""));
    if (createdCompare !== 0) return createdCompare;
    return left.id.localeCompare(right.id);
  });
}

export function encodeSearchCursor(result: Pick<RankedSearchResult<unknown>, "score" | "createdAt" | "id">): string {
  const payload: SearchCursorPayload = {
    score: result.score,
    createdAt: String(result.createdAt ?? ""),
    id: result.id,
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeSearchCursor(cursor: string | undefined): SearchCursorPayload | null {
  if (!cursor) return null;
  try {
    const payload = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<SearchCursorPayload>;
    if (!Number.isFinite(payload.score) || typeof payload.createdAt !== "string" || typeof payload.id !== "string") {
      return null;
    }
    return { score: Number(payload.score), createdAt: payload.createdAt, id: payload.id };
  } catch {
    return null;
  }
}

function isAfterCursor<TEntity>(result: RankedSearchResult<TEntity>, cursor: SearchCursorPayload): boolean {
  if (result.score !== cursor.score) return result.score < cursor.score;
  const resultCreatedAt = String(result.createdAt ?? "");
  if (resultCreatedAt !== cursor.createdAt) return resultCreatedAt < cursor.createdAt;
  return result.id > cursor.id;
}

export function paginateRankedSearchResults<TEntity>(
  results: RankedSearchResult<TEntity>[],
  options: { limit?: number; cursor?: string } = {},
): { results: RankedSearchResult<TEntity>[]; nextCursor?: string } {
  const limit = Math.min(50, Math.max(1, Math.trunc(options.limit ?? 10)));
  const cursor = decodeSearchCursor(options.cursor);
  const eligible = cursor ? results.filter((result) => isAfterCursor(result, cursor)) : results;
  const page = eligible.slice(0, limit);
  const hasMore = eligible.length > page.length;
  const last = page.at(-1);

  return {
    results: page,
    nextCursor: hasMore && last ? encodeSearchCursor(last) : undefined,
  };
}
