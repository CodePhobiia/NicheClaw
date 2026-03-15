# Runbook: Compilation Failed

## Symptoms

- The `niche compile` CLI command exits with an error.
- No compilation record is created for the program.
- Readiness checks fail because no compilation exists.

## Diagnosis Steps

1. **Read the error message.** Compilation errors include the source file path and a description of the validation failure.

2. **Check source files.** Source ingestion reads YAML/JSON source files. Common issues:
   - Malformed YAML/JSON syntax.
   - Missing required fields (`niche_program_id`, `domain_name`, `source_type`).
   - Invalid field values (empty strings where non-empty is required).

3. **Check for schema validation errors.** The compiler validates all source records against TypeBox schemas. The error message includes the specific validation failure path.

4. **Verify the program exists.** The compilation flow requires an existing program record. Use `niche.programs.get` to verify.

5. **Check for duplicate compilation IDs.** The store refuses to overwrite existing compilation records. If you need to recompile, use a new compilation ID or delete the old record.

## Resolution

- **Fix source files.** Correct the YAML/JSON syntax or missing fields, then re-run `niche compile`.
- **Create the program first.** If the program does not exist, use `niche create` to create it before compiling.
- **Schema mismatch.** If the source schema has changed, update the source files to match the new schema. Check `src/niche/domain/source-types.ts` for current field requirements.
- **Permission errors.** Ensure the source files are readable and the store directory is writable.

## Prevention

- Validate source files with `niche readiness` before compiling.
- Use the `niche quickstart` flow which guides through program creation and compilation in sequence.
- Keep source files in version control to track changes.
