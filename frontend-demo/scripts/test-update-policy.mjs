import assert from "node:assert/strict";

import {
  compareVersions,
  isRequiredUpdate,
  shouldOfferUpdate,
} from "../src/updatePolicy.ts";

assert.equal(compareVersions("0.3.6", "0.3.5"), 1);
assert.equal(compareVersions("0.3.5", "0.3.5"), 0);
assert.equal(compareVersions("0.3", "0.3.0"), 0);
assert.equal(shouldOfferUpdate("0.3.6", "0.3.5"), true);
assert.equal(shouldOfferUpdate("0.3.4", "0.3.5"), false);
assert.equal(isRequiredUpdate({ min_supported: "0.3.0" }, "0.3.5"), false);
assert.equal(isRequiredUpdate({ min_supported: "0.3.6" }, "0.3.5"), true);
assert.equal(isRequiredUpdate({ min_supported: "0.1.0", mandatory: true }, "0.3.5"), true);

console.log("update policy: all assertions passed");
