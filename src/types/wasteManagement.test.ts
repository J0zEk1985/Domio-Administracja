import { parseISO } from "date-fns";
import { describe, expect, it } from "vitest";

import { mapSyncLogRowToSyncLog, type WasteScheduleSyncLogRow } from "@/types/wasteManagement";

const row: WasteScheduleSyncLogRow = {
  id: "log-1",
  location_id: "loc-1",
  city_adapter: "lodz",
  sync_status: "success",
  records_added: 4,
  records_updated: 0,
  error_message: null,
  synced_at: "2026-10-07T06:15:00.000Z",
  synced_by: null,
};

describe("mapSyncLogRowToSyncLog", () => {
  it("copies synced_at onto syncedAt so the waste tab can format it", () => {
    const mapped = mapSyncLogRowToSyncLog(row);

    expect(mapped).toMatchObject({
      id: "log-1",
      locationId: "loc-1",
      cityAdapter: "lodz",
      syncStatus: "success",
      recordsAdded: 4,
      recordsUpdated: 0,
      errorMessage: null,
      syncedAt: "2026-10-07T06:15:00.000Z",
      syncedBy: null,
    });
    expect(() => parseISO(mapped.syncedAt)).not.toThrow();
  });
});
