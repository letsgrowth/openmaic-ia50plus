/**
 * IA 50+ runs OpenMAIC as an internal educational engine, never as a second
 * public application. The platform authenticates the learner and calls this
 * service with a dedicated bearer token over a private Docker network.
 */

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;

  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return mismatch === 0;
}

export function hasValidIa50Bearer(authorization: string | null, expectedToken: string): boolean {
  if (expectedToken.length < 32 || !authorization?.startsWith('Bearer ')) return false;
  const suppliedToken = authorization.slice('Bearer '.length);
  return constantTimeEqual(suppliedToken, expectedToken);
}
