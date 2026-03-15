import type { CliDeps } from "../../cli/deps.js";
import { createDefaultDeps } from "../../cli/deps.js";
import { assertPreparedSeedReadiness } from "../../niche/domain/index.js";
import { readRequiredJsonFileStrict } from "../../niche/json.js";
import { assertPreparedNicheRunSeed } from "../../niche/runtime/prepare-run-seed.js";
import type { RuntimeEnv } from "../../runtime.js";
import { defaultRuntime } from "../../runtime.js";
import { agentCommand } from "../agent.js";

export type NicheRunOptions = {
  seedPath: string;
  message: string;
  agentId?: string;
  to?: string;
  sessionId?: string;
  sessionKey?: string;
  thinking?: string;
  thinkingOnce?: string;
  verbose?: string;
  json?: boolean;
  timeout?: string;
  deliver?: boolean;
  replyTo?: string;
  replyChannel?: string;
  replyAccountId?: string;
  threadId?: string | number;
  messageChannel?: string;
  channel?: string;
  accountId?: string;
  bestEffortDeliver?: boolean;
};

export async function nicheRunCommand(
  opts: NicheRunOptions,
  runtime: RuntimeEnv = defaultRuntime,
  deps: CliDeps = createDefaultDeps(),
): Promise<Awaited<ReturnType<typeof agentCommand>>> {
  const nicheRunSeed = assertPreparedNicheRunSeed(
    readRequiredJsonFileStrict(opts.seedPath, `prepared Niche run seed ${opts.seedPath}`),
    `prepared Niche run seed ${opts.seedPath}`,
  );
  assertPreparedSeedReadiness(nicheRunSeed, process.env);

  return await agentCommand(
    {
      message: opts.message,
      agentId: opts.agentId,
      to: opts.to,
      sessionId: opts.sessionId,
      sessionKey: opts.sessionKey,
      thinking: opts.thinking,
      thinkingOnce: opts.thinkingOnce,
      verbose: opts.verbose,
      json: opts.json,
      timeout: opts.timeout,
      deliver: opts.deliver,
      replyTo: opts.replyTo,
      replyChannel: opts.replyChannel,
      replyAccountId: opts.replyAccountId,
      threadId: opts.threadId,
      messageChannel: opts.messageChannel,
      channel: opts.channel,
      accountId: opts.accountId,
      bestEffortDeliver: opts.bestEffortDeliver,
      nicheRunSeed,
    },
    runtime,
    deps,
  );
}
