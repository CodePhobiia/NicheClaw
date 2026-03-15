import type { ReplyPayload } from "../../auto-reply/types.js";
import { runVerifierPack, type VerifierDecision } from "../verifier/index.js";
import {
  getNicheRunTraceContext,
  markNicheVerifierPhaseFinished,
  markNicheVerifierPhaseStarted,
  recordVerifierDecisionForRun,
} from "./run-trace-capture.js";

export type VerifierGateAction = "deliver" | "repair" | "escalate" | "block";

export type VerifierGateFinalizationResult = {
  action: VerifierGateAction;
  decision: VerifierDecision;
  delivery_payloads: ReplyPayload[];
  suppressed_original_output: boolean;
};

type GateChannelData = {
  decisionId: string;
  outcome: VerifierDecision["outcome"];
  action: VerifierGateAction;
};

function inferOutputFormat(payloads: ReplyPayload[]): "text" | "json" | "markdown" {
  const combinedText = payloads
    .map((payload) => payload.text?.trim())
    .filter((value): value is string => Boolean(value))
    .join("\n\n");
  if (!combinedText) {
    return "text";
  }

  try {
    JSON.parse(combinedText);
    return "json";
  } catch {
    if (/(^#|\n#|\*\*|`{3}|^- )/mu.test(combinedText)) {
      return "markdown";
    }
    return "text";
  }
}

function payloadHasGateMetadata(payload: ReplyPayload): boolean {
  const metadata =
    payload.channelData &&
    typeof payload.channelData === "object" &&
    !Array.isArray(payload.channelData)
      ? (payload.channelData.nicheVerifierGate as GateChannelData | undefined)
      : undefined;
  return Boolean(metadata?.decisionId);
}

export function payloadsAlreadyCarryVerifierGate(payloads: ReplyPayload[]): boolean {
  return payloads.some((payload) => payloadHasGateMetadata(payload));
}

function annotatePayload(payload: ReplyPayload, metadata: GateChannelData): ReplyPayload {
  return {
    ...payload,
    channelData: {
      ...payload.channelData,
      nicheVerifierGate: metadata,
    },
  };
}

function buildReplacementPayload(params: {
  action: VerifierGateAction;
  decision: VerifierDecision;
  prototype?: ReplyPayload;
}): ReplyPayload {
  const base = params.prototype ?? {};
  const intro =
    params.action === "repair"
      ? "NicheClaw verifier requested repair before final delivery."
      : params.action === "escalate"
        ? "NicheClaw verifier escalated the final output for review."
        : "NicheClaw verifier vetoed the final output.";

  return annotatePayload(
    {
      ...base,
      text: `${intro} ${params.decision.rationale}`,
      isError: true,
      mediaUrl: undefined,
      mediaUrls: undefined,
      audioAsVoice: undefined,
    },
    {
      decisionId: params.decision.decision_id,
      outcome: params.decision.outcome,
      action: params.action,
    },
  );
}

export function applyVerifierGate(params: {
  payloads: ReplyPayload[];
  decision: VerifierDecision;
}): VerifierGateFinalizationResult {
  const firstPayload = params.payloads[0];
  if (params.decision.outcome === "approved") {
    return {
      action: "deliver",
      decision: params.decision,
      delivery_payloads: params.payloads.map((payload) =>
        annotatePayload(payload, {
          decisionId: params.decision.decision_id,
          outcome: params.decision.outcome,
          action: "deliver",
        }),
      ),
      suppressed_original_output: false,
    };
  }

  if (params.decision.outcome === "repair_requested") {
    return {
      action: "repair",
      decision: params.decision,
      delivery_payloads: [
        buildReplacementPayload({
          action: "repair",
          decision: params.decision,
          prototype: firstPayload,
        }),
      ],
      suppressed_original_output: true,
    };
  }

  if (params.decision.outcome === "escalated") {
    return {
      action: "escalate",
      decision: params.decision,
      delivery_payloads: [
        buildReplacementPayload({
          action: "escalate",
          decision: params.decision,
          prototype: firstPayload,
        }),
      ],
      suppressed_original_output: true,
    };
  }

  return {
    action: "block",
    decision: params.decision,
    delivery_payloads: [
      buildReplacementPayload({
        action: "block",
        decision: params.decision,
        prototype: firstPayload,
      }),
    ],
    suppressed_original_output: true,
  };
}

export function maybeRunNicheVerifierGate(params: {
  runId?: string;
  payloads: ReplyPayload[];
  checkedAt: string;
}): VerifierGateFinalizationResult | null {
  if (!params.runId || params.payloads.length === 0) {
    return null;
  }
  if (payloadsAlreadyCarryVerifierGate(params.payloads)) {
    return null;
  }

  const context = getNicheRunTraceContext(params.runId);
  if (!context?.verifierPackConfig || !context.domainPack || !context.sourceAccessManifest) {
    return null;
  }

  const combinedText = params.payloads
    .map((payload) => payload.text ?? "")
    .filter((value) => value.length > 0)
    .join("\n\n");

  markNicheVerifierPhaseStarted(params.runId, params.checkedAt);
  const decision = (() => {
    try {
      return runVerifierPack({
        config: context.verifierPackConfig,
        input: {
          run_id: params.runId,
          niche_program_id: context.nicheProgramId,
          candidate_output: combinedText,
          output_format: inferOutputFormat(params.payloads),
          domain_pack: context.domainPack,
          source_access_manifest: context.sourceAccessManifest,
          evidence_bundle_refs: context.evidenceBundleRefs ?? [],
          checked_at: params.checkedAt,
        },
      });
    } finally {
      markNicheVerifierPhaseFinished(params.runId, new Date().toISOString());
    }
  })();
  recordVerifierDecisionForRun(params.runId, decision);
  return applyVerifierGate({
    payloads: params.payloads,
    decision,
  });
}
