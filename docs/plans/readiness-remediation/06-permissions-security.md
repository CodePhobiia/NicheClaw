## Remediation Plan: Permissions / Security (70 to 100)

### PS-01 -- Gateway Input Schema Validation for Niche Write Methods

**Gap addressed:** Gap 3 -- Gateway input validation is shallow; `niche.monitor.assess` and `niche.release.rollback` only check presence of fields, not full TypeBox schema shapes.

**Current state:** In `src/gateway/server-methods/niche.ts`, the `niche.release.rollback` handler uses `assertString` for simple type checks and the `niche.monitor.assess` handler manually checks `typeof params.definition !== "object"` and casts with `as PromotedMonitorDefinition`. Neither handler validates against TypeBox schemas. The rest of the codebase already uses `validateJsonSchemaValue` from `src/plugins/schema-validator.ts` extensively (e.g., artifact-registry, benchmark-run-store, lifecycle-events, program-store).

**Plan:**

1. Create TypeBox request parameter schemas in a new file `src/gateway/server-methods/niche-schemas.ts`:
   - `NicheRollbackParamsSchema` -- validates `activeStackId` (IdentifierString), `agentId` (IdentifierString), `nicheProgramId` (IdentifierString), `rollbackTarget` (Optional NonEmptyString), `reason` (Optional NonEmptyString).
   - `NicheMonitorAssessParamsSchema` -- validates `activeStackId`, `agentId`, `nicheProgramId`, `rollbackTarget`, `definition` (matching `PromotedMonitorDefinition` shape with `monitor` and `cadence_defaults` sub-objects), `observation` (object).
   - For read methods that take identifiers, create simple parameter schemas: `NicheGetByIdParamsSchema` (single IdentifierString field), `NicheListFilterParamsSchema`, etc.

2. In `src/gateway/server-methods/niche.ts`, replace the manual `assertString` + typeof checks with `validateJsonSchemaValue` calls using the new schemas. Return `ErrorCodes.INVALID_REQUEST` with detailed validation error messages on failure.

3. Add a new test file `test/niche/gateway/input-validation.test.ts` covering:
   - Rollback with missing fields returns validation error
   - Rollback with non-identifier characters returns validation error
   - Monitor assess with malformed definition returns validation error
   - Monitor assess with valid params passes validation
   - Read methods with invalid identifier format return validation error

**Files to modify:**

- Create: `src/gateway/server-methods/niche-schemas.ts`
- Modify: `src/gateway/server-methods/niche.ts`
- Create: `test/niche/gateway/input-validation.test.ts`

**Dependencies:** None (foundational).

---

### PS-02 -- Rate Limiting for Niche Write Operations

**Gap addressed:** Gap 4 -- No rate limiting on `niche.release.rollback` and `niche.monitor.assess`.

**Current state:** The gateway already has a rate-limiting pattern in `src/gateway/control-plane-rate-limit.ts` that provides a token-bucket implementation keyed by device ID + client IP. It is applied in `src/gateway/server-methods.ts` (line 111) for `CONTROL_PLANE_WRITE_METHODS` (`config.apply`, `config.patch`, `update.run`). The niche write methods are not in that set.

**Plan:**

1. In `src/gateway/server-methods.ts`, add `niche.release.rollback` and `niche.monitor.assess` to the `CONTROL_PLANE_WRITE_METHODS` set. This reuses the existing 3-per-60s token bucket.

2. Alternatively, if a different rate limit is desired (e.g., 5 per 60s for niche operations), create a separate bucket set in `src/gateway/control-plane-rate-limit.ts`:
   - Add `NICHE_WRITE_RATE_LIMIT_MAX_REQUESTS = 5` and `NICHE_WRITE_RATE_LIMIT_WINDOW_MS = 60_000`.
   - Add `nicheWriteBuckets` map and `consumeNicheWriteBudget` function following the same pattern as `consumeControlPlaneWriteBudget`.
   - In `server-methods.ts`, add a `NICHE_WRITE_METHODS` set and check it after the existing control-plane check.

3. Add tests in `test/niche/gateway/rate-limiting.test.ts`:
   - Verify first N calls succeed
   - Verify call N+1 returns `UNAVAILABLE` with `retryAfterMs`
   - Verify the window resets after the time period

**Recommendation:** Start with the simpler approach (add to existing `CONTROL_PLANE_WRITE_METHODS`). Only create a separate bucket if the operations need different limits.

**Files to modify:**

- Modify: `src/gateway/server-methods.ts` (add 2 entries to the Set)
- Optionally modify: `src/gateway/control-plane-rate-limit.ts`
- Create: `test/niche/gateway/rate-limiting.test.ts`

**Dependencies:** None.

---

### PS-03 -- Input Sanitization for User-Provided Strings

**Gap addressed:** Gap 5 -- Niche program names, objectives, and other user-provided strings are stored as-is with no sanitization.

**Current state:** The `IdentifierString` pattern in `src/niche/schema/common.ts` already constrains identifiers to `^[a-z0-9]+(?:[._-][a-z0-9]+)*$`, which is safe. However, `NonEmptyString` fields (used for `name`, `objective`, `description`, etc.) accept any non-empty string including control characters, very long strings, and potential injection payloads. The store layer (`saveJsonFile`) serializes them directly to JSON.

**Plan:**

1. Create a sanitization utility `src/niche/domain/sanitize-input.ts`:
   - `sanitizeNicheTextField(value: string, maxLength?: number): string` -- strips control characters (codepoints 0x00-0x1F, 0x7F-0x9F except tab/newline), trims leading/trailing whitespace, enforces a maximum length (default 10,000 characters for objectives/descriptions, 200 for names).
   - `validateNicheTextField(value: string, label: string, maxLength?: number): { ok: true; sanitized: string } | { ok: false; reason: string }` -- calls sanitize and returns error if result is empty after sanitization.

2. Apply sanitization in gateway handlers (`src/gateway/server-methods/niche.ts`) for the `reason` field in rollback and any user-provided description/note strings.

3. Apply sanitization in the domain layer:
   - `src/niche/domain/source-ingest.ts` -- sanitize `source.title`, `source.trustNotes`, `source.accessPattern` through the utility before normalization.
   - `src/niche/domain/compiler.ts` -- sanitize niche program objective and name during compilation.
   - `src/niche/store/program-store.ts` -- add a sanitization pass in `assertNicheProgram` for `NonEmptyString` fields before schema validation.

4. Add tests `test/niche/domain/sanitize-input.test.ts`:
   - Control character stripping
   - Length truncation
   - Empty-after-sanitization rejection
   - Normal strings pass through unchanged
   - Tab/newline preservation in objectives

**Files:**

- Create: `src/niche/domain/sanitize-input.ts`
- Create: `test/niche/domain/sanitize-input.test.ts`
- Modify: `src/gateway/server-methods/niche.ts`
- Modify: `src/niche/domain/source-ingest.ts`
- Modify: `src/niche/store/program-store.ts`

**Dependencies:** PS-01 (schemas should be in place first).

---

### PS-04 -- Durable Audit Log for Niche Lifecycle Events

**Gap addressed:** Gap 2 -- Lifecycle events are emitted through the plugin hook system but not durably stored in an audit-specific format.

**Current state:** `src/niche/runtime/lifecycle-events.ts` emits events via `hookRunner.runNicheLifecycle()` and logs failures at warn level. The events themselves are fully schema-validated (`LifecycleEventSchema` in `src/niche/contracts/lifecycle.ts`) with rich typed payloads. But they are fire-and-forget -- if no plugin is registered for `niche_lifecycle`, they are silently dropped. There is no persistent audit trail.

**Plan:**

1. Create `src/niche/store/audit-log.ts`:
   - Define an audit log entry type: `{ event_id, event_type, occurred_at, actor, niche_program_id, run_id, payload_summary, raw_event }`.
   - The `actor` field should capture operator identity from `ControlPlaneActor` when available, or `"system"` for automated operations.
   - Storage: append-only JSONL file at `<niche-state-root>/audit/audit.jsonl`. Use `fs.appendFileSync` with proper permissions (0o600).
   - `appendAuditEntry(entry, env)` -- validates, serializes to one JSON line, appends.
   - `readAuditEntries(filter?, env)` -- reads, parses, optionally filters by event_type, niche_program_id, or time range.
   - Rotation: `rotateAuditLog(env)` -- renames current log to `audit-<timestamp>.jsonl` when size exceeds 10MB.

2. Add the audit path to `src/niche/store/paths.ts`:
   - Add `audit` to `NICHE_STATE_DIRNAMES` in `src/niche/constants.ts`.
   - Add `audit: string` to `NicheStoreRoots`.
   - Add `resolveAuditLogPath(env)` function.

3. Integrate in `src/niche/runtime/lifecycle-events.ts`:
   - After schema validation and before hook dispatch, call `appendAuditEntry` with the validated event.
   - This ensures the audit log captures events even when no plugin hooks are registered.

4. Also integrate in gateway write handlers (`src/gateway/server-methods/niche.ts`):
   - After successful `executeRollback` and `runMonitorAssessmentCycle`, append an audit entry including the operator identity resolved from `resolveControlPlaneActor(client)`.

5. Export from `src/niche/store/index.ts`.

6. Add tests `test/niche/store/audit-log.test.ts`:
   - Append and read back entries
   - Filter by event_type
   - Filter by time range
   - JSONL format correctness
   - File permissions are 0o600
   - Rotation triggers at threshold

**Files:**

- Create: `src/niche/store/audit-log.ts`
- Create: `test/niche/store/audit-log.test.ts`
- Modify: `src/niche/constants.ts` (add audit dirname)
- Modify: `src/niche/store/paths.ts` (add audit path)
- Modify: `src/niche/store/index.ts` (export)
- Modify: `src/niche/runtime/lifecycle-events.ts` (call appendAuditEntry)
- Modify: `src/gateway/server-methods/niche.ts` (audit writes)

**Dependencies:** None, but PS-01 should land first for clean gateway handler code.

---

### PS-05 -- Per-Niche-Program Access Scoping

**Gap addressed:** Gap 1 -- Any operator with `operator.read` scope can read ALL niche programs, not just their own.

**Current state:** The scope system in `src/gateway/method-scopes.ts` has broad scope categories (`operator.read`, `operator.write`, `operator.admin`). The `ConnectParams` schema shows the client has a `client.id` and `scopes` array, plus an optional `permissions` record. Niche programs (`NicheProgramSchema`) have no owner/creator field.

**Plan:**

1. Extend `NicheProgramSchema` in `src/niche/schema/program.ts`:
   - Add `owner_id: Type.Optional(IdentifierString)` -- the operator/client ID that created the program.
   - Add `access_policy: Type.Optional(Type.Object({ readers: OptionalStringListSchema, writers: OptionalStringListSchema }))` -- explicit access lists.
   - These are optional for backward compatibility with existing programs (which become "open access").

2. Create `src/niche/domain/access-control.ts`:
   - `canAccessNicheProgram(params: { program: NicheProgram, clientId: string, scopes: string[], action: "read" | "write" }): boolean`
   - Logic: admin scope always passes. If program has no `owner_id`, it is accessible to all (legacy). If program has `owner_id`, only the owner and explicitly listed readers/writers can access. Write access requires both `operator.write` scope and being in the writers list or being the owner.
   - `enrichProgramWithOwner(program: NicheProgram, ownerId: string): NicheProgram` -- sets `owner_id` during program creation.

3. Apply access control in gateway handlers (`src/gateway/server-methods/niche.ts`):
   - In `niche.programs.get`, after fetching the program, check `canAccessNicheProgram`. Return 403-style error if denied.
   - In `niche.programs.list`, filter returned programs by access control.
   - In `niche.release.rollback` and `niche.monitor.assess`, check write access for the referenced `nicheProgramId`.

4. Apply at the CLI layer:
   - In `src/commands/niche/create.ts`, set the `owner_id` to the current operator identity.

5. Tests `test/niche/domain/access-control.test.ts`:
   - Admin scope bypasses all checks
   - Owner can read/write
   - Listed reader can read but not write
   - Unlisted operator is denied
   - Legacy programs (no owner_id) are accessible to all

**Files:**

- Modify: `src/niche/schema/program.ts`
- Create: `src/niche/domain/access-control.ts`
- Create: `test/niche/domain/access-control.test.ts`
- Modify: `src/gateway/server-methods/niche.ts`
- Modify: `src/commands/niche/create.ts`

**Dependencies:** PS-01 (gateway schema validation should be in place).

---

### PS-06 -- Niche-Scoped RBAC (niche.read / niche.write / niche.admin)

**Gap addressed:** Gap 8 -- No "niche-operator" vs "niche-viewer" distinction. All niche reads are under `operator.read`, writes under `operator.write`.

**Current state:** `src/gateway/method-scopes.ts` has five scopes. The niche methods are mixed in with all other gateway methods under `operator.read` and `operator.write`.

**Plan:**

1. Add new scope constants in `src/gateway/method-scopes.ts`:
   - `NICHE_READ_SCOPE = "niche.read"`
   - `NICHE_WRITE_SCOPE = "niche.write"`
   - `NICHE_ADMIN_SCOPE = "niche.admin"`
   - Add to `OperatorScope` union type.

2. Move all 17 niche read methods from `READ_SCOPE` to `NICHE_READ_SCOPE` in `METHOD_SCOPE_GROUPS`.

3. Move `niche.release.rollback` and `niche.monitor.assess` from `WRITE_SCOPE` to `NICHE_WRITE_SCOPE`.

4. Update `authorizeOperatorScopesForMethod`:
   - `niche.read` should also be satisfied by `operator.read` (backward compatibility) or `niche.admin`.
   - `niche.write` should be satisfied by `operator.write`, `niche.admin`, or `operator.admin`.
   - This is achieved by adding fallback logic: if the required scope is `niche.read`, accept `operator.read`, `niche.read`, `niche.write`, `niche.admin`, or `operator.admin`.

5. Update `CLI_DEFAULT_OPERATOR_SCOPES` to include all three niche scopes (backward-compatible since existing CLI clients already get full access).

6. Tests in existing `src/gateway/method-scopes.test.ts` (or create one):
   - Verify niche read methods require `niche.read` (or fallback to `operator.read`)
   - Verify niche write methods require `niche.write`
   - Verify an operator with only `operator.read` but no `niche.read` can still read niche (backward compat)
   - Verify an operator with only `niche.read` cannot access non-niche reads

**Files:**

- Modify: `src/gateway/method-scopes.ts`
- Create or modify: test for method-scopes

**Dependencies:** None, but coordinate with PS-05 for the full access model.

---

### PS-07 -- Credential Handling for Provider API Keys in Optimizer Tuning Adapters

**Gap addressed:** Gap 6 -- No secret/credential handling for provider API keys in optimizer tuning adapters.

**Current state:** `src/niche/optimizer/tuning-adapters.ts` defines `ProviderNativeTuningJobPlan` which includes `required_credentials: string[]` -- just a list of credential names. `src/niche/optimizer/tuning-capabilities.ts` similarly lists `required_credentials: string[]`. Neither module resolves, validates, or securely handles actual credential values. The broader codebase has a comprehensive `src/secrets/` module with `SecretRef` types, resolution, and audit.

**Plan:**

1. Create `src/niche/optimizer/credential-resolver.ts`:
   - `resolveOptimizerCredentials(params: { requiredCredentials: string[], env: NodeJS.ProcessEnv }): Promise<Map<string, { resolved: boolean, ref?: SecretRef }>>`
   - For each required credential name, attempt resolution via the existing `resolveSecretRefValue` from `src/secrets/resolve.ts` or environment variable lookup.
   - Never store resolved values in artifacts or logs. Return a status map indicating which credentials are available.
   - `validateCredentialAvailability(params: { plan: ProviderNativeTuningJobPlan, env: NodeJS.ProcessEnv }): { ok: boolean, missing: string[] }` -- checks all required credentials are resolvable before job execution.

2. Integrate in `src/niche/optimizer/job-executor.ts`:
   - Before executing a job that requires provider tuning, call `validateCredentialAvailability`.
   - If credentials are missing, fail the job with a clear error rather than proceeding.

3. Add credential validation to the `buildProviderNativeTuningJobPlan` flow in `src/niche/optimizer/tuning-adapters.ts`:
   - Add an optional `credentialValidator` parameter that can pre-check availability.
   - Add a `credential_status` field to `ProviderNativeTuningJobPlan` recording availability at plan time.

4. Ensure credential names never appear in audit logs or run traces. Add a scrubbing check in `src/niche/runtime/persist-run-trace.ts` that redacts any field matching common credential patterns.

5. Tests `test/niche/optimizer/credential-resolver.test.ts`:
   - Missing credentials detected before execution
   - Available credentials resolve successfully
   - Credential values never appear in plan/artifact output
   - Job fails gracefully with clear message when credentials unavailable

**Files:**

- Create: `src/niche/optimizer/credential-resolver.ts`
- Create: `test/niche/optimizer/credential-resolver.test.ts`
- Modify: `src/niche/optimizer/job-executor.ts`
- Modify: `src/niche/optimizer/tuning-adapters.ts`

**Dependencies:** None.

---

### PS-08 -- Artifact Integrity Verification (Checksums / Signatures)

**Gap addressed:** Gap 9 -- Benchmark results and other file-system artifacts have no integrity verification. The store has no checksums or signatures.

**Current state:** `src/niche/store/artifact-registry.ts` already computes SHA-256 `content_hash` via `computeArtifactContentHash()` and stores it in the `ArtifactRef`. It also verifies the hash on read in `readStoredArtifact()` (line 229: `if (computedHash !== record.ref.content_hash)`). However, this only covers artifacts -- not benchmark results, programs, manifests, compilation records, readiness reports, or run traces. Those store modules (`benchmark-run-store.ts`, `program-store.ts`, `manifest-store.ts`, etc.) do schema validation on read but no integrity check.

**Plan:**

1. Create `src/niche/store/integrity.ts`:
   - `computeStoreRecordHash(data: unknown): string` -- compute SHA-256 of the stable JSON serialization (reuse `stableSerialize` from artifact-registry, extract it to a shared utility).
   - `wrapWithIntegrityEnvelope<T>(data: T): { data: T, integrity: { hash: string, algorithm: "sha256", computed_at: string } }` -- wraps any store record with a hash envelope.
   - `verifyIntegrityEnvelope<T>(envelope: { data: T, integrity: { hash: string } }): { ok: boolean, expected: string, computed: string }` -- verifies on read.

2. Extract `stableSerialize` from `src/niche/store/artifact-registry.ts` to `src/niche/store/integrity.ts` (or a shared util) and import it back.

3. Integrate progressively into each store module:
   - `src/niche/store/benchmark-run-store.ts` -- wrap `writeBenchmarkResultRecord` and verify in `getBenchmarkResultRecord`.
   - `src/niche/store/program-store.ts` -- wrap `writeNicheProgram` and verify in `getNicheProgram`.
   - `src/niche/store/manifest-store.ts` -- wrap write functions and verify in get functions.
   - `src/niche/store/readiness-store.ts`, `src/niche/store/domain-pack-store.ts` -- same pattern.

4. Backward compatibility: if a store record is read without an integrity envelope (pre-existing data), log a warning but do not reject. Add a migration flag that allows backfilling hashes.

5. Tests `test/niche/store/integrity.test.ts`:
   - Hash computation is deterministic
   - Tampered data fails verification
   - Records without envelopes pass with warning (backward compat)
   - Envelope round-trip works for each store type

**Files:**

- Create: `src/niche/store/integrity.ts`
- Create: `test/niche/store/integrity.test.ts`
- Modify: `src/niche/store/artifact-registry.ts` (extract stableSerialize)
- Modify: `src/niche/store/benchmark-run-store.ts`
- Modify: `src/niche/store/program-store.ts`
- Modify: `src/niche/store/manifest-store.ts`

**Dependencies:** None, but touch many files so should be sequenced carefully.

---

### PS-09 -- PII Detection / Redaction in Source Ingestion

**Gap addressed:** Gap 10 -- No PII detection or redaction in the source ingestion pipeline.

**Current state:** `src/niche/domain/source-ingest.ts` normalizes source content (text normalization, path validation) and tracks `pii_status` as a string field in `SourceRightsMetadata` and `GovernedDataStatus`. But the `pii_status` is purely declarative -- the operator sets it to whatever string they want (e.g., "none", "redacted"). There is no automated detection. The schema (`src/niche/schema/governance.ts`) defines `pii_status: NonEmptyString` with no enumerated values.

**Plan:**

1. Create `src/niche/domain/pii-detector.ts`:
   - Define pattern-based PII detectors for common categories:
     - Email: regex for email addresses
     - Phone: regex for common phone number formats
     - SSN: regex for US SSN patterns
     - Credit card: regex for common card number patterns (Luhn-checkable)
     - IP addresses: regex for IPv4/IPv6
   - `detectPiiInText(text: string): PiiDetectionResult` where result contains `{ detected: boolean, findings: Array<{ category: string, count: number, sample_positions: number[] }> }`. Never include the actual PII values in the result.
   - `redactPiiInText(text: string, categories?: string[]): { redacted: string, redaction_count: number }` -- replaces detected PII with `[REDACTED:<category>]` placeholders.

2. Integrate into `src/niche/domain/source-ingest.ts`:
   - In `normalizeSourceDescriptor`, after text normalization, run `detectPiiInText`.
   - If PII is detected and `rights.pii_status` is not `"acknowledged"` or `"pre-redacted"`, either:
     - Auto-redact and set `pii_status = "auto-redacted"`, or
     - Quarantine the source with `quarantined: true, quarantine_reason: "unacknowledged_pii_detected"`.
   - The behavior should be configurable via the program's `rights_and_data_policy.pii_policy`.

3. Define enumerated PII status values in `src/niche/schema/governance.ts`:
   - Add `PII_STATUSES = ["none", "acknowledged", "pre-redacted", "auto-redacted", "detected-unresolved"] as const`.
   - Keep the schema as `NonEmptyString` for backward compat but document the expected values.

4. Tests `test/niche/domain/pii-detector.test.ts`:
   - Email detection
   - Phone number detection
   - SSN detection (with various formats)
   - Credit card detection (with Luhn validation)
   - Text with no PII returns clean result
   - Redaction replaces PII correctly
   - PII values never appear in detection results

5. Integration test `test/niche/domain/pii-ingestion.test.ts`:
   - Source with PII and `pii_status: "none"` gets quarantined
   - Source with PII and `pii_status: "acknowledged"` passes through
   - Source with auto-redaction enabled gets clean output

**Files:**

- Create: `src/niche/domain/pii-detector.ts`
- Create: `test/niche/domain/pii-detector.test.ts`
- Create: `test/niche/domain/pii-ingestion.test.ts`
- Modify: `src/niche/domain/source-ingest.ts`

**Dependencies:** PS-03 (input sanitization utilities as a foundation).

---

### PS-10 -- Encryption at Rest for Sensitive Store Files

**Gap addressed:** Gap 7 -- Store files are readable by any process with the same UID. File permissions are 0o600 but there is no encryption at rest.

**Current state:** `src/infra/json-file.ts` writes with `chmod 0o600` (owner-only read/write) and directories with `0o700`. This is appropriate for most scenarios, but does not protect against compromise of the user account or disk access.

**Plan:**

1. Create `src/niche/store/encryption.ts`:
   - Use Node.js `crypto.createCipheriv` / `crypto.createDecipheriv` with AES-256-GCM.
   - Key derivation: `deriveNicheEncryptionKey(params: { passphrase?: string, env: NodeJS.ProcessEnv }): Buffer` -- derives a 256-bit key from either an explicit passphrase or `NICHE_ENCRYPTION_KEY` env var using PBKDF2 with a salt stored at `<niche-state-root>/.encryption-salt`.
   - `encryptJsonPayload(data: unknown, key: Buffer): Buffer` -- JSON.stringify, compress (optional), encrypt with random IV, prepend IV + auth tag.
   - `decryptJsonPayload(encrypted: Buffer, key: Buffer): unknown` -- reverse.
   - Feature flag: `isNicheEncryptionEnabled(env): boolean` -- returns true only if `NICHE_ENCRYPTION_KEY` is set or a keyfile exists.

2. Create `src/niche/store/encrypted-json-file.ts`:
   - `saveEncryptedJsonFile(pathname, data, env)` -- if encryption enabled, encrypt then write binary; otherwise fall back to `saveJsonFile`.
   - `loadEncryptedJsonFile(pathname, env)` -- detect format (JSON text vs encrypted binary) and handle both.
   - This provides transparent encryption without changing any calling code.

3. Integrate selectively -- only sensitive stores should use encrypted files:
   - Audit log (`src/niche/store/audit-log.ts` from PS-04)
   - Run traces (contain conversation content)
   - Source content in artifacts (may contain proprietary data)
   - Leave schemas, manifests, and programs as plaintext (they are configuration, not sensitive data).

4. Tests `test/niche/store/encryption.test.ts`:
   - Round-trip encrypt/decrypt
   - Wrong key fails with clear error
   - Backward compat: unencrypted files still readable
   - Feature flag off means no encryption
   - Auth tag tampering detected

**Files:**

- Create: `src/niche/store/encryption.ts`
- Create: `src/niche/store/encrypted-json-file.ts`
- Create: `test/niche/store/encryption.test.ts`
- Modify: `src/niche/store/audit-log.ts` (use encrypted writes)

**Dependencies:** PS-04 (audit log should exist), PS-08 (integrity verification complements encryption).

---

## Implementation Sequencing

**Phase 1 (Sequential, shared infrastructure):**

1. PS-01 -- Gateway input schema validation (foundational)
2. PS-02 -- Rate limiting for niche writes (simple, reuses existing pattern)
3. PS-03 -- Input sanitization (small utility module)
4. PS-04 -- Durable audit log (new store module)

**Phase 2 (Parallelizable):**

- PS-05 -- Per-program access control
- PS-06 -- Niche-scoped RBAC
- PS-07 -- Credential handling for optimizer
- PS-08 -- Artifact integrity verification
- PS-09 -- PII detection in source ingestion

**Phase 3 (Final):**

- PS-10 -- Encryption at rest (depends on PS-04 and PS-08)

---

### Critical Files for Implementation

- `src/gateway/server-methods/niche.ts` - Central gateway handler for all niche methods; needs schema validation, rate limiting, access control, audit writes, and sanitization
- `src/gateway/method-scopes.ts` - Scope classification system; must add niche-specific RBAC scopes and update authorization logic
- `src/niche/store/paths.ts` - Store path resolution; must add audit log path and encryption salt path
- `src/niche/domain/source-ingest.ts` - Source ingestion pipeline; must integrate PII detection, input sanitization, and enhanced validation
- `src/niche/store/artifact-registry.ts` - Artifact storage with existing integrity pattern (content_hash); must extract stableSerialize for reuse across all store modules
