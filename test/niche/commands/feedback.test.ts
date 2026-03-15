import { describe, expect, it } from "vitest";
import { nicheFeedbackCommand } from "../../../src/commands/niche/feedback.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

describe("nicheFeedbackCommand", () => {
  it("submits feedback and lists it back", async () => {
    await withTempHome(async () => {
      const submitResult = await nicheFeedbackCommand({
        nicheProgramId: "repo-ci-specialist",
        stage: "compile",
        rating: 4,
        comment: "Compilation was smooth.",
        json: true,
      });

      expect(submitResult.submitted).toBeDefined();
      expect(submitResult.submitted!.niche_program_id).toBe("repo-ci-specialist");
      expect(submitResult.submitted!.stage).toBe("compile");
      expect(submitResult.submitted!.rating).toBe(4);
      expect(submitResult.submitted!.comment).toBe("Compilation was smooth.");
      expect(submitResult.submitted!.feedback_id).toMatch(/^feedback-/);
      expect(submitResult.submitted!.created_at).toBeTruthy();

      const listResult = await nicheFeedbackCommand({
        list: true,
        json: true,
      });

      expect(listResult.entries).toBeDefined();
      expect(listResult.entries).toHaveLength(1);
      expect(listResult.entries![0].niche_program_id).toBe("repo-ci-specialist");
      expect(listResult.entries![0].rating).toBe(4);
    });
  });

  it("returns empty list when no feedback exists", async () => {
    await withTempHome(async () => {
      const result = await nicheFeedbackCommand({
        list: true,
        json: true,
      });

      expect(result.entries).toBeDefined();
      expect(result.entries).toHaveLength(0);
    });
  });

  it("throws when required fields are missing", async () => {
    await withTempHome(async () => {
      await expect(
        nicheFeedbackCommand({
          nicheProgramId: "repo-ci-specialist",
          json: true,
        }),
      ).rejects.toThrow("--niche-program-id, --stage, and --rating are required.");

      await expect(
        nicheFeedbackCommand({
          stage: "compile",
          rating: 3,
          json: true,
        }),
      ).rejects.toThrow("--niche-program-id, --stage, and --rating are required.");

      await expect(
        nicheFeedbackCommand({
          nicheProgramId: "repo-ci-specialist",
          stage: "compile",
          json: true,
        }),
      ).rejects.toThrow("--niche-program-id, --stage, and --rating are required.");
    });
  });
});
