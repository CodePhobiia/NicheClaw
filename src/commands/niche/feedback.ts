import fs from "node:fs";
import path from "node:path";
import { resolveNicheStoreRoots } from "../../niche/store/paths.js";

export type NicheFeedbackOptions = {
  nicheProgramId?: string;
  stage?: string;
  rating?: number;
  comment?: string;
  list?: boolean;
  json: boolean;
};

export type FeedbackEntry = {
  feedback_id: string;
  niche_program_id: string;
  stage: string;
  rating: number;
  comment: string;
  created_at: string;
};

export type NicheFeedbackResult = {
  submitted?: FeedbackEntry;
  entries?: FeedbackEntry[];
};

function resolveFeedbackDir(env: NodeJS.ProcessEnv): string {
  return path.join(resolveNicheStoreRoots(env).root, "feedback");
}

export async function nicheFeedbackCommand(
  opts: NicheFeedbackOptions,
): Promise<NicheFeedbackResult> {
  const feedbackDir = resolveFeedbackDir(process.env);

  if (opts.list) {
    if (!fs.existsSync(feedbackDir)) {
      const result: NicheFeedbackResult = { entries: [] };
      if (opts.json) console.log(JSON.stringify(result, null, 2));
      else console.log("No feedback collected yet.");
      return result;
    }
    const files = fs.readdirSync(feedbackDir).filter((f) => f.endsWith(".json"));
    const entries: FeedbackEntry[] = files.map((f) => {
      return JSON.parse(fs.readFileSync(path.join(feedbackDir, f), "utf-8"));
    });
    const result: NicheFeedbackResult = { entries };
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (entries.length === 0) {
        console.log("No feedback collected yet.");
      } else {
        console.log(`\n${entries.length} feedback entries:\n`);
        for (const e of entries) {
          console.log(`  [${e.rating}/5] ${e.stage} — ${e.niche_program_id}: ${e.comment}`);
        }
      }
    }
    return result;
  }

  if (!opts.nicheProgramId || !opts.stage || !opts.rating) {
    throw new Error("--niche-program-id, --stage, and --rating are required.");
  }

  const entry: FeedbackEntry = {
    feedback_id: `feedback-${Date.now()}`,
    niche_program_id: opts.nicheProgramId,
    stage: opts.stage,
    rating: opts.rating,
    comment: opts.comment ?? "",
    created_at: new Date().toISOString(),
  };

  if (!fs.existsSync(feedbackDir)) {
    fs.mkdirSync(feedbackDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(feedbackDir, `${entry.feedback_id}.json`),
    JSON.stringify(entry, null, 2),
  );

  const result: NicheFeedbackResult = { submitted: entry };
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Feedback submitted: [${entry.rating}/5] for ${entry.stage}`);
  }
  return result;
}
