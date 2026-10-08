// jsdom ships its own Blob and File without arrayBuffer()/text(); the engine
// relies on the standard ones, so use Node's implementations in tests.
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { webcrypto } from 'node:crypto';

Object.assign(globalThis, { Blob: NodeBlob, File: NodeFile });
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
