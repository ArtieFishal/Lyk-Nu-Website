// Redirects '@netlify/blobs' to the in-memory stub.
export async function resolve(spec, ctx, next) {
  if (spec === '@netlify/blobs') return { url: new URL('./blobs-stub.mjs', import.meta.url).href, shortCircuit: true };
  return next(spec, ctx);
}
