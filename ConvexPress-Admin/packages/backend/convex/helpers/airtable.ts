/**
 * Airtable Integration Helper
 *
 * Shared utility for fetching records from Airtable REST API.
 * Used by all airtableSync/ actions to pull blueprint data.
 *
 * Environment variables (set in Convex dashboard):
 *   - AIRTABLE_API_KEY: Personal access token
 *   - AIRTABLE_BASE_ID: Base ID (e.g., "appqpJ8QQkoKsH02O")
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
  createdTime: string;
}

interface AirtableListResponse {
  records: AirtableRecord[];
  offset?: string;
}

interface FetchOptions {
  /** Airtable view to use (optional) */
  view?: string;
  /** Fields to return (optional, returns all if omitted) */
  fields?: string[];
  /** Filter formula (optional) */
  filterByFormula?: string;
  /** Max records per page (default 100, max 100) */
  pageSize?: number;
}

// ─── Fetch Records ───────────────────────────────────────────────────────────

/**
 * Fetch all records from an Airtable table, handling pagination automatically.
 *
 * @param tableId - The Airtable table ID (e.g., "tblquj6encuzq7p1f")
 * @param options - Optional fetch configuration
 * @returns All records from the table
 */
export async function fetchAirtableRecords(
  tableId: string,
  options?: FetchOptions,
): Promise<AirtableRecord[]> {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!apiKey) throw new Error("AIRTABLE_API_KEY environment variable not set");
  if (!baseId) throw new Error("AIRTABLE_BASE_ID environment variable not set");

  const allRecords: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const url = buildUrl(baseId, tableId, options, offset);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Airtable API error (${response.status}): ${errorText}`,
      );
    }

    const data = (await response.json()) as AirtableListResponse;
    allRecords.push(...data.records);
    offset = data.offset;
  } while (offset);

  return allRecords;
}

// ─── Linked Record Resolution ────────────────────────────────────────────────

/**
 * Build a lookup map from record ID -> display value for a given table.
 * Used to resolve linked record arrays to human-readable names/codes.
 *
 * @param tableId - The Airtable table ID to fetch
 * @param displayField - The field name to use as the display value (e.g., "Name", "Action Code")
 * @returns Map of record ID -> display value
 */
export async function buildLookupMap(
  tableId: string,
  displayField: string,
): Promise<Map<string, string>> {
  const records = await fetchAirtableRecords(tableId, {
    fields: [displayField],
  });

  const map = new Map<string, string>();
  for (const record of records) {
    const value = record.fields[displayField];
    if (typeof value === "string") {
      map.set(record.id, value);
    }
  }
  return map;
}

/**
 * Resolve an array of linked record IDs to their display values.
 * Handles null/undefined gracefully.
 *
 * @param linkedIds - Array of Airtable record IDs (or undefined)
 * @param lookupMap - Map from buildLookupMap()
 * @returns Array of resolved string values
 */
export function resolveLinkedRecords(
  linkedIds: unknown,
  lookupMap: Map<string, string>,
): string[] {
  if (!Array.isArray(linkedIds)) return [];
  return linkedIds
    .map((id) => (typeof id === "string" ? lookupMap.get(id) : undefined))
    .filter((v): v is string => v !== undefined);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Safely extract a string field from an Airtable record.
 */
export function getString(
  fields: Record<string, unknown>,
  key: string,
): string | undefined {
  const val = fields[key];
  return typeof val === "string" ? val : undefined;
}

/**
 * Safely extract a number field from an Airtable record.
 */
export function getNumber(
  fields: Record<string, unknown>,
  key: string,
): number | undefined {
  const val = fields[key];
  return typeof val === "number" ? val : undefined;
}

/**
 * Safely extract a boolean field from an Airtable record.
 */
export function getBoolean(
  fields: Record<string, unknown>,
  key: string,
): boolean {
  return fields[key] === true;
}

// ─── URL Builder ─────────────────────────────────────────────────────────────

function buildUrl(
  baseId: string,
  tableId: string,
  options?: FetchOptions,
  offset?: string,
): string {
  const url = new URL(
    `https://api.airtable.com/v0/${baseId}/${tableId}`,
  );

  const pageSize = options?.pageSize ?? 100;
  url.searchParams.set("pageSize", String(pageSize));

  if (options?.view) {
    url.searchParams.set("view", options.view);
  }

  if (options?.filterByFormula) {
    url.searchParams.set("filterByFormula", options.filterByFormula);
  }

  if (options?.fields) {
    for (const field of options.fields) {
      url.searchParams.append("fields[]", field);
    }
  }

  if (offset) {
    url.searchParams.set("offset", offset);
  }

  return url.toString();
}
