import { backfillTeacherRolloutAuthority } from "../src/niche/store/index.js";

const result = backfillTeacherRolloutAuthority(process.env);
console.log(JSON.stringify(result, null, 2));

if (result.blocked_missing_governed_status.length > 0) {
  process.exitCode = 1;
}
