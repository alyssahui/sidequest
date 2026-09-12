import { describe, expect, it } from "vitest";
import { fixture } from "./helpers";
describe("want and need list", () => {
  it("adds, edits, converts and removes while preserving source", async () => {
    const f = fixture();
    const item = await f.quests.addItem({
      ownerUserId: "zuri",
      kind: "NEED",
      text: " Return books ",
      tags: ["learning"],
      idempotencyKey: "add",
    });
    const edited = await f.quests.editItem({
      itemId: item.id,
      ownerUserId: "zuri",
      text: "Return library books",
      tags: ["learning"],
      expectedVersion: 1,
    });
    const quest = await f.quests.convertItem({
      itemId: item.id,
      ownerUserId: "zuri",
      templateId: "cmu-teach",
      expiresAt: "2026-09-12T18:00:00.000Z",
      idempotencyKey: "convert",
    });
    expect(quest.source).toEqual({ type: "WANT_NEED", sourceId: item.id });
    expect((await f.store.get(item.id))?.convertedQuestId).toBe(quest.id);
    await f.quests.removeItem(item.id, "zuri");
    expect((await f.quests.list("zuri")).items).toEqual([]);
    expect(edited.version).toBe(2);
  });
});
