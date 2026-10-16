/**
 * A repeatable random sequence (the Park–Miller generator): the same seed gives the same numbers on every run, so a
 * test that samples at random fails the same way each time.
 * @param seed where the sequence starts (1 to 2,147,483,646)
 * @returns a function giving the next number in [0, 1) on each call
 */
export function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}
