import { eventSortKey, type Event } from "@theprawnsplit/core";

export function isArchivedEventLog(events: Event[]): boolean {
  let archived = false;
  for (const event of [...events].sort(eventSortKey)) {
    if (event.t === "GroupArchived") archived = true;
    if (event.t === "GroupUnarchived") archived = false;
  }
  return archived;
}
