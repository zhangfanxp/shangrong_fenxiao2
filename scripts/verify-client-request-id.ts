import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createClientRequestId } from "../lib/client-request-id";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
assert.match(createClientRequestId(), uuid);
const httpCrypto = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) } as Pick<Crypto, "getRandomValues">;
const ids = Array.from({ length: 1000 }, () => createClientRequestId(httpCrypto));
assert(ids.every(id => uuid.test(id)));
assert.equal(new Set(ids).size, ids.length);
assert.throws(() => createClientRequestId({} as Crypto), /当前浏览器不支持/);
console.log("PASS UUID v4, HTTP fallback, uniqueness and unsupported browser feedback");
