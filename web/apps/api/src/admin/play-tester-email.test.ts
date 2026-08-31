import assert from "node:assert/strict";
import {
  detectEmailDomainTypo,
  sanitizeEmailForPlayExport,
} from "./play-tester-email";

assert.equal(
  detectEmailDomainTypo("rumanbintihamdi@gmail.come")?.fixed,
  "rumanbintihamdi@gmail.com"
);
assert.equal(
  sanitizeEmailForPlayExport("samiiranour04@gmail.coms"),
  "samiiranour04@gmail.com"
);
assert.equal(
  sanitizeEmailForPlayExport("tiinitana@gmail.con"),
  "tiinitana@gmail.com"
);
assert.equal(
  sanitizeEmailForPlayExport("gabow2525@gmail.ckm"),
  "gabow2525@gmail.com"
);
assert.equal(
  sanitizeEmailForPlayExport("haniyahussein0@gmail.comh"),
  "haniyahussein0@gmail.com"
);
assert.equal(
  sanitizeEmailForPlayExport("mohamedyar80@gmail.comm"),
  "mohamedyar80@gmail.com"
);
assert.equal(
  sanitizeEmailForPlayExport("good@gmail.com"),
  "good@gmail.com"
);
assert.equal(sanitizeEmailForPlayExport("not-an-email"), null);
assert.equal(sanitizeEmailForPlayExport("bad@"), null);

console.log("play-tester-email ok");
