import { beforeEach, describe, expect, it, vi } from "vitest";

interface CapturedStatement {
  sql: string;
  values: unknown[];
}

const { batches, db } = vi.hoisted(() => {
  const capturedBatches: CapturedStatement[][] = [];
  return {
    batches: capturedBatches,
    db: {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            return { sql, values };
          },
        };
      },
      async batch(statements: CapturedStatement[]) {
        capturedBatches.push(statements);
        return [];
      },
    },
  };
});

vi.mock("@/lib/runtime", () => ({
  getDb: () => db,
}));

import { recordTrashResults } from "@/lib/repository";

describe("recordTrashResults", () => {
  beforeEach(() => {
    batches.length = 0;
  });

  it("chunks message cleanup so every D1 query has at most 100 parameters", async () => {
    const messageIds = Array.from({ length: 250 }, (_, index) => `message-${index}`);

    await recordTrashResults(
      "person@example.com",
      [
        {
          subscriptionId: "subscription-1",
          sender: "Example Sender",
          movedCount: messageIds.length,
          status: "moved",
          detail: "Moved 250 Inbox messages to Trash.",
        },
      ],
      new Map([["subscription-1", messageIds]]),
    );

    const deleteStatements = batches
      .flat()
      .filter((statement) => statement.sql.includes("DELETE FROM messages"));

    expect(deleteStatements).toHaveLength(3);
    expect(deleteStatements.every((statement) => statement.values.length <= 100)).toBe(
      true,
    );
    expect(deleteStatements.flatMap((statement) => statement.values.slice(1))).toEqual(
      messageIds,
    );
  });
});
