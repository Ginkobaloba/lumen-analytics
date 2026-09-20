// Throwaway file to prove Lint reddens Quick Verify (prefer-const is an
// error-severity rule here, confirmed via `eslint --print-config`).
// Reverted before the break-test branch is deleted.
export function breakTestLint(): number {
  let total = 0;
  return total;
}
