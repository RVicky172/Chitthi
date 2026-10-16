/**
 * Orders strings by UTF-16 code unit, as `Array.prototype.sort()` does without a comparator.
 * @param left one string
 * @param right the other
 * @returns negative, zero or positive
 */
export const codeUnitOrder = (left: string, right: string): number => Number(left > right) - Number(left < right);
