// Called after every write: on the embedded database it schedules the local backup.

import { scheduleBackup } from "../backup";

export function changed() {
  scheduleBackup();
}
