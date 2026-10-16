import { isRecord } from '../../engine/guards';

/*
 * Reading providers' JSON answers without trusting their shape: each reader returns a field when it has the expected
 * type, else nothing, so an unexpected answer ends in the adapter's own "returned no …" error.
 */

/**
 * A field of an object.
 * @param value the parsed answer (or part of it)
 * @param key the field
 * @returns the field, or undefined when the value isn't an object
 */
export const fieldOf = (value: unknown, key: string): unknown => (isRecord(value) ? value[key] : undefined);

/**
 * A text field.
 * @param value the parsed answer (or part of it)
 * @param key the field
 * @returns the text, or undefined
 */
export const textField = (value: unknown, key: string): string | undefined => {
  const field = fieldOf(value, key);
  return typeof field === 'string' ? field : undefined;
};

/**
 * A list field.
 * @param value the parsed answer (or part of it)
 * @param key the field
 * @returns the list, or an empty one
 */
export const listField = (value: unknown, key: string): unknown[] => {
  const field = fieldOf(value, key);
  return Array.isArray(field) ? field : [];
};
