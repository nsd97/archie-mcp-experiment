// Lightweight X-Ray capture wrapper, enabled only outside local/test
type CaptureFn = <T>(name: string, fn: () => Promise<T>) => Promise<T>;
let capture: CaptureFn = async (_name, fn) => fn();

try {
  if ((process.env.NODE_ENV || '').toLowerCase() === 'production') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AWSXRay = require('aws-xray-sdk-core');
    capture = (async (name: string, fn: () => Promise<unknown>) => {
      const parent = AWSXRay.getSegment();
      if (!parent) {
        // No active segment (e.g., tracing disabled) → run without capture.
        return fn();
      }
      const sub = parent.addNewSubsegment(name);
      AWSXRay.setSegment(sub);
      try {
        return await fn();
      } catch (e) {
        sub.addError(e as Error);
        throw e;
      } finally {
        sub.close();
        AWSXRay.setSegment(parent);
      }
    }) as CaptureFn;
  }
} catch {}

export async function captureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  return capture(name, fn);
}


