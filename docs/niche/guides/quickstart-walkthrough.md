---
summary: "Annotated walkthrough of every prompt in the interactive openclaw niche quickstart command."
read_when:
  - About to run the quickstart for the first time
  - Want to understand what each quickstart prompt means before answering
  - Need to understand the artifacts produced by quickstart
title: "Quickstart Walkthrough"
---

# Quickstart Walkthrough

The `openclaw niche quickstart` command is an interactive wizard that creates a complete NicheClaw setup in one pass. It prompts for 12 inputs, then stores a niche program, compiles a domain pack, evaluates readiness, and builds baseline and candidate manifests.

## Running the Quickstart

```bash
openclaw niche quickstart
```

Pass `--json` for structured output without interactive prompts (all inputs must be piped or provided by a wrapper).

## What the Quickstart Does

The quickstart performs the following operations in sequence:

1. Collects 12 configuration inputs via interactive prompts.
2. Builds a `NicheProgram` object from those inputs.
3. Stores the program in the NicheClaw state root.
4. Builds `structured_text` source descriptors from the provided source paths. For each path, it reads the file content and wraps it in a source descriptor with full rights (all rights flags set to `true`, `data_zone: "train"`, `provenance_status: "verified"`).
5. Compiles the domain pack and evaluates readiness.
6. Builds and stores baseline and candidate manifests.
7. Prints a summary of all generated artifacts and context-aware next steps.

## Step-by-Step Prompt Annotation

### Prompt 1: Program name

```
Program name: [defaults to current directory name]
```

The display name for your niche program. The quickstart slugifies this name (lowercase, non-alphanumeric characters replaced with hyphens) to derive the `niche_program_id`. For example, "Code Review Agent" becomes `code-review-agent`.

### Prompt 2: Objective

```
Objective (what should this specialization do?):
```

A free-text description of what the specialized agent should accomplish. This becomes the `objective` field on the niche program. Be specific -- the objective is used downstream for domain pack compilation and readiness evaluation context.

### Prompt 3: Risk class

```
Risk class: [low / moderate / high]
```

Select from one of three risk classes:

- **low** -- minimal guardrails, suitable for low-stakes tasks.
- **moderate** -- standard guardrails with operator review.
- **high** -- maximum guardrails, all safety checks enforced.

### Prompt 4: Provider

```
Provider: [defaults to "anthropic"]
```

The LLM provider for the planner runtime. This becomes `runtime_stack.planner_runtime.provider`.

### Prompt 5: Model

```
Model: [defaults to "claude-sonnet-4-5-20250514"]
```

The model identifier for the planner runtime. This becomes `runtime_stack.planner_runtime.model_id`.

### Prompt 6: API mode

```
API mode: [defaults to "messages"]
```

The API interaction mode. This becomes `runtime_stack.planner_runtime.api_mode`. The default `messages` is appropriate for most Anthropic and OpenAI-compatible providers.

### Prompt 7: Allowed tools

```
Allowed tools (space to toggle, enter to confirm):
  [ ] exec
  [ ] read
  [ ] apply_patch
  [ ] web_search
  [ ] bash
```

A multi-select prompt. Use space to toggle tools on/off, then press enter to confirm. The selected tools populate the `allowed_tools` array on the niche program.

<Info>
The tool availability readiness dimension requires a score of at least 80. The formula is `min(100, 50 + tool_count * 15)`, so selecting at least 2 tools ensures the threshold is met.
</Info>

### Prompt 8: Source paths

```
Source paths (comma-separated file or directory paths):
```

Provide one or more comma-separated file paths. The quickstart reads each file and creates a `structured_text` source descriptor from its content. If a file does not exist or is empty, a placeholder string is used instead.

All quickstart-generated sources use the `repos` source kind with full rights and `data_zone: "train"`.

### Prompt 9: Success metric label

```
Success metric label:
```

A human-readable name for the primary success metric (for example, "Task completion accuracy" or "Code review quality").

### Prompt 10: Metric objective

```
Metric objective: [maximize / minimize / target]
```

Select the optimization direction for your metric:

- **maximize** -- higher is better (accuracy, quality scores).
- **minimize** -- lower is better (error rates, latency).
- **target** -- aim for a specific value.

### Prompt 11: Metric target description

```
Metric target description:
```

A free-text description of what the metric target looks like. For example: "Improve held-out task success over the same-model baseline."

### Prompt 12: Metric measurement method

```
Metric measurement method:
```

How the metric is measured. For example: "Paired benchmark deltas on atomic and episode suites."

## Understanding the Output Artifacts

After all prompts are answered, the quickstart produces and prints paths for these artifacts:

| Artifact                   | Description                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Program**                | The stored niche program JSON.                                                                                       |
| **Compilation record**     | Full compilation output including domain pack, normalized sources, benchmark seed hints, and compiled domain config. |
| **Source access manifest** | Declares which tools, retrieval indices, live sources, and network/sandbox policies apply.                           |
| **Readiness report**       | Scored readiness dimensions, hard blockers, warnings, and recommended actions.                                       |
| **Baseline manifest**      | The unspecialized baseline configuration for same-model benchmark comparison.                                        |
| **Candidate manifest**     | The candidate configuration that will be benchmarked against the baseline.                                           |

The quickstart also prints the readiness status. If the status is `not_ready`, it generates targeted guidance and prints recompile instructions.

## What to Do After Quickstart

The quickstart prints context-aware next steps based on the readiness status.

**If readiness is `ready` or `ready_with_warnings`:**

1. Prepare benchmark artifacts:

   ```bash
   openclaw niche prepare-benchmark \
     --niche-program-id <id> \
     --emit-release-artifacts --json
   ```

2. Run the benchmark:

   ```bash
   openclaw niche benchmark \
     --from-program <id> \
     --suite <suite-path> \
     --live --json
   ```

3. Check status:

   ```bash
   openclaw niche status --niche-program-id <id>
   ```

4. See what to do next:
   ```bash
   openclaw niche next --niche-program-id <id>
   ```

**If readiness is `not_ready`:**

1. Review the blocker guidance printed by the quickstart.
2. Fix the identified issues (add more source kinds, add benchmark seeds, fix rights declarations).
3. Recompile:
   ```bash
   openclaw niche compile \
     --niche-program-id <id> \
     --source <paths...>
   ```
4. See the [Improving Readiness](/niche/guides/improving-readiness) guide for detailed remediation steps.

<Tip>
The quickstart only generates `structured_text` source descriptors from file paths. For benchmark readiness, you will likely need to add `benchmark_seed` descriptors manually and recompile. See [Getting Started](/niche/guides/getting-started) Step 4 for the benchmark seed format.
</Tip>
