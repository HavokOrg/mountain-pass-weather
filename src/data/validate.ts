/**
 * Tiny runtime validators for untrusted JSON: API responses and config.
 * Everything from the network goes through these before it reaches the UI.
 */

export class DataError extends Error {
  override name = 'DataError';
}

export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function record(value: unknown, path: string): JsonRecord {
  if (!isRecord(value)) throw new DataError(`${path}: expected an object`);
  return value;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function num(obj: JsonRecord, key: string, path: string): number {
  const value = obj[key];
  if (!isFiniteNumber(value)) throw new DataError(`${path}.${key}: expected a number`);
  return value;
}

export function str(obj: JsonRecord, key: string, path: string): string {
  const value = obj[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new DataError(`${path}.${key}: expected a non-empty string`);
  }
  return value;
}

export function arr(obj: JsonRecord, key: string, path: string): unknown[] {
  const value = obj[key];
  if (!Array.isArray(value)) throw new DataError(`${path}.${key}: expected an array`);
  return value;
}

function checkLength(list: unknown[], length: number | undefined, where: string): void {
  if (length !== undefined && list.length !== length) {
    throw new DataError(`${where}: expected ${length} items, got ${list.length}`);
  }
}

export function strArray(obj: JsonRecord, key: string, path: string, length?: number): string[] {
  const list = arr(obj, key, path);
  checkLength(list, length, `${path}.${key}`);
  return list.map((item, i) => {
    if (typeof item !== 'string') throw new DataError(`${path}.${key}[${i}]: expected a string`);
    return item;
  });
}

/** Number array where individual entries may be null (common in forecast APIs). */
export function numOrNullArray(
  obj: JsonRecord,
  key: string,
  path: string,
  length?: number,
): (number | null)[] {
  const list = arr(obj, key, path);
  checkLength(list, length, `${path}.${key}`);
  return list.map((item, i) => {
    if (item === null) return null;
    if (!isFiniteNumber(item)) throw new DataError(`${path}.${key}[${i}]: expected a number or null`);
    return item;
  });
}
