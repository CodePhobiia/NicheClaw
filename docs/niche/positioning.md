---
summary: "How NicheClaw differs from prompt optimization, RAG layers, and fine-tuning services."
read_when:
  - You want to understand NicheClaw's value proposition
  - You are evaluating alternatives to NicheClaw
title: "Competitive Positioning"
---

# Competitive Positioning

## What NicheClaw is NOT

NicheClaw is not a prompt optimizer. It does not search for better prompts.

NicheClaw is not a RAG layer. It does not just retrieve and inject documents.

NicheClaw is not a fine-tuning API wrapper. It does not simply call a provider's tuning endpoint.

## What NicheClaw IS

NicheClaw is a whole-system specialization framework that compiles domain knowledge, benchmarks a specialized agent against a same-model baseline, and promotes the candidate only when it demonstrably outperforms -- with full audit trail.

## Comparison

| Capability                 | Prompt Tuning | RAG Layer | Fine-Tuning Service | NicheClaw  |
| -------------------------- | ------------- | --------- | ------------------- | ---------- |
| Same-model benchmark       | No            | No        | Sometimes           | Always     |
| Held-out eval gating       | No            | No        | No                  | Yes        |
| Release promotion policy   | No            | No        | No                  | Yes        |
| Post-promotion monitoring  | No            | No        | No                  | Yes        |
| Whole-stack specialization | No            | No        | Model weights only  | Full stack |
| Contamination detection    | No            | No        | No                  | Yes        |
| Rollback support           | No            | No        | No                  | Yes        |
| Governance and audit trail | No            | No        | No                  | Yes        |

## The key differentiator

NicheClaw proves improvement before deployment. Everything else deploys first and hopes.

Even when the runtime model cannot be weight-tuned, NicheClaw can still specialize through the surrounding stack -- retrieval, tool selection, constraint enforcement, verification -- and prove measurable lift against a baseline using the same model.
