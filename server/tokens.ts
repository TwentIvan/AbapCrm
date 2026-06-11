/** Lightweight token counter shared across cost-estimator and context-assembler.
 *  Kept in its own module to avoid circular imports.
 *  Rule of thumb: 1 token ≈ 4 characters (English prose / code).
 */
export function countTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
