/**
 * PHP Serialized Data Parser
 *
 * Parses PHP serialized strings (as commonly found in WordPress meta tables)
 * into JavaScript objects/arrays.
 *
 * Supported types:
 *   - a: Array (associative/indexed)
 *   - s: String
 *   - i: Integer
 *   - d: Double/Float
 *   - b: Boolean
 *   - N: Null
 *   - O: Object (treated as associative array with __class property)
 *   - r: Reference (partial support)
 *   - R: Reference (partial support)
 *
 * Examples:
 *   - 'a:2:{s:3:"foo";s:3:"bar";i:0;s:3:"baz";}' -> { foo: "bar", 0: "baz" }
 *   - 's:5:"hello";' -> "hello"
 *   - 'i:42;' -> 42
 *   - 'b:1;' -> true
 *   - 'N;' -> null
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export type PHPValue =
  | string
  | number
  | boolean
  | null
  | PHPValue[]
  | PHPArray
  | PHPObject;

export interface PHPArray {
  [key: string]: PHPValue;
}

export interface PHPObject extends PHPArray {
  __class: string;
}

// ─── Parser State ──────────────────────────────────────────────────────────

interface ParserState {
  data: string;
  offset: number;
  refs: PHPValue[];
}

// ─── Core Parser ───────────────────────────────────────────────────────────

/**
 * Parse PHP serialized data to JavaScript object/value.
 *
 * @param data - PHP serialized string
 * @returns Parsed JavaScript value
 * @throws Error if parsing fails
 */
export function unserializePHP(data: string): PHPValue {
  if (!data || typeof data !== "string") {
    throw new Error("Invalid input: expected non-empty string");
  }

  const state: ParserState = {
    data: data.trim(),
    offset: 0,
    refs: [],
  };

  try {
    const result = parseValue(state);
    return result;
  } catch (error) {
    throw new Error(
      `PHP unserialize failed at offset ${state.offset}: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Check if a string appears to be PHP serialized data.
 *
 * @param data - String to check
 * @returns True if the string looks like PHP serialized data
 */
export function isSerialized(data: unknown): boolean {
  if (!data || typeof data !== "string") {
    return false;
  }

  const trimmed = data.trim();

  // Check for null
  if (trimmed === "N;") {
    return true;
  }

  // Check for common serialization patterns
  if (trimmed.length < 2) {
    return false;
  }

  // Must start with type indicator followed by colon
  const typeIndicator = trimmed[0];
  if (!["a", "s", "i", "d", "b", "O", "r", "R"].includes(typeIndicator)) {
    return false;
  }

  // Must have colon after type
  if (trimmed[1] !== ":") {
    return false;
  }

  // Additional validation for specific types
  try {
    // Try to parse - if it succeeds without error, it's likely serialized
    unserializePHP(trimmed);
    return true;
  } catch {
    return false;
  }
}

// ─── Value Parsers ─────────────────────────────────────────────────────────

function parseValue(state: ParserState): PHPValue {
  const type = readChar(state);

  switch (type) {
    case "N":
      return parseNull(state);
    case "b":
      return parseBoolean(state);
    case "i":
      return parseInt(state);
    case "d":
      return parseDouble(state);
    case "s":
      return parseString(state);
    case "a":
      return parseArray(state);
    case "O":
      return parseObject(state);
    case "r":
    case "R":
      return parseReference(state);
    default:
      throw new Error(`Unknown type indicator: ${type}`);
  }
}

function parseNull(state: ParserState): null {
  expectChar(state, ";");
  const result = null;
  state.refs.push(result);
  return result;
}

function parseBoolean(state: ParserState): boolean {
  expectChar(state, ":");
  const value = readChar(state);
  expectChar(state, ";");
  const result = value === "1";
  state.refs.push(result);
  return result;
}

function parseInt(state: ParserState): number {
  expectChar(state, ":");
  const value = readUntil(state, ";");
  const result = Number.parseInt(value, 10);
  state.refs.push(result);
  return result;
}

function parseDouble(state: ParserState): number {
  expectChar(state, ":");
  const value = readUntil(state, ";");

  // Handle special values
  if (value === "INF") {
    state.refs.push(Infinity);
    return Infinity;
  }
  if (value === "-INF") {
    state.refs.push(-Infinity);
    return -Infinity;
  }
  if (value === "NAN") {
    state.refs.push(NaN);
    return NaN;
  }

  const result = Number.parseFloat(value);
  state.refs.push(result);
  return result;
}

function parseString(state: ParserState): string {
  expectChar(state, ":");
  const length = Number.parseInt(readUntil(state, ":"), 10);
  expectChar(state, '"');

  // Read exactly `length` bytes (not characters - PHP uses byte length)
  // For ASCII-only strings this is the same
  const value = readExact(state, length);

  expectChar(state, '"');
  expectChar(state, ";");

  state.refs.push(value);
  return value;
}

function parseArray(state: ParserState): PHPArray {
  expectChar(state, ":");
  const count = Number.parseInt(readUntil(state, ":"), 10);
  expectChar(state, "{");

  const result: PHPArray = {};
  state.refs.push(result);

  for (let i = 0; i < count; i++) {
    // Parse key (must be string or integer)
    const keyType = peekChar(state);
    let key: string | number;

    if (keyType === "s") {
      key = parseValue(state) as string;
    } else if (keyType === "i") {
      key = parseValue(state) as number;
    } else {
      throw new Error(`Invalid array key type: ${keyType}`);
    }

    // Parse value
    const value = parseValue(state);
    result[String(key)] = value;
  }

  expectChar(state, "}");
  return result;
}

function parseObject(state: ParserState): PHPObject {
  expectChar(state, ":");

  // Parse class name
  const classNameLength = Number.parseInt(readUntil(state, ":"), 10);
  expectChar(state, '"');
  const className = readExact(state, classNameLength);
  expectChar(state, '"');
  expectChar(state, ":");

  // Parse property count and properties
  const count = Number.parseInt(readUntil(state, ":"), 10);
  expectChar(state, "{");

  const result: PHPObject = { __class: className };
  state.refs.push(result);

  for (let i = 0; i < count; i++) {
    // Parse property name (always string in objects)
    let propName = parseValue(state) as string;

    // Handle private/protected property names
    // Private: \0ClassName\0propName
    // Protected: \0*\0propName
    if (propName.includes("\0")) {
      const parts = propName.split("\0").filter(Boolean);
      propName = parts[parts.length - 1];
    }

    // Parse value
    const value = parseValue(state);
    result[propName] = value;
  }

  expectChar(state, "}");
  return result;
}

function parseReference(state: ParserState): PHPValue {
  expectChar(state, ":");
  const refIndex = Number.parseInt(readUntil(state, ";"), 10);

  // PHP references are 1-indexed
  if (refIndex <= 0 || refIndex > state.refs.length) {
    throw new Error(`Invalid reference index: ${refIndex}`);
  }

  return state.refs[refIndex - 1];
}

// ─── Helper Functions ──────────────────────────────────────────────────────

function readChar(state: ParserState): string {
  if (state.offset >= state.data.length) {
    throw new Error("Unexpected end of data");
  }
  return state.data[state.offset++];
}

function peekChar(state: ParserState): string {
  if (state.offset >= state.data.length) {
    throw new Error("Unexpected end of data");
  }
  return state.data[state.offset];
}

function expectChar(state: ParserState, expected: string): void {
  const char = readChar(state);
  if (char !== expected) {
    throw new Error(`Expected '${expected}' but got '${char}'`);
  }
}

function readUntil(state: ParserState, terminator: string): string {
  const start = state.offset;
  const end = state.data.indexOf(terminator, start);

  if (end === -1) {
    throw new Error(`Expected '${terminator}' not found`);
  }

  state.offset = end + 1; // Skip the terminator
  return state.data.substring(start, end);
}

function readExact(state: ParserState, length: number): string {
  if (state.offset + length > state.data.length) {
    throw new Error("Unexpected end of data while reading string");
  }

  const value = state.data.substring(state.offset, state.offset + length);
  state.offset += length;
  return value;
}

// ─── Utility Functions ─────────────────────────────────────────────────────

/**
 * Safely unserialize with a fallback value on failure.
 */
export function safeUnserialize<T>(data: string, fallback: T): PHPValue | T {
  try {
    return unserializePHP(data);
  } catch {
    return fallback;
  }
}

/**
 * Unserialize and extract a specific key from the result.
 */
export function unserializeAndGet<T>(
  data: string,
  key: string,
  fallback: T
): PHPValue | T {
  try {
    const result = unserializePHP(data);
    if (typeof result === "object" && result !== null && key in result) {
      return (result as PHPArray)[key];
    }
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * Check if a value might be double-serialized and unserialize both layers.
 */
export function deepUnserialize(data: string): PHPValue {
  let result = unserializePHP(data);

  // Check if the result is a string that itself looks serialized
  while (typeof result === "string" && isSerialized(result)) {
    result = unserializePHP(result);
  }

  return result;
}
