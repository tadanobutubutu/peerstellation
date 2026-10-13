/**
 * A UI batch may be queued while the page is being torn down. It must not
 * touch a renderer whose WASM resources have already been released.
 */
export function shouldCommitUiBatch(appDisposed: boolean): boolean {
  return !appDisposed;
}
