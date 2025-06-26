/*
 * Copyright 2024 Kyle Micallef Bonnici
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { setInterval } from "timers";
import { EventEmitter } from "events";
import { resetCachedCPreprocessorParserProvider } from "./providers/cachedCPreprocessorParser";
import { resetTokenizedDocumentProvider } from "./providers/tokenizedDocument";

class HeapMonitor extends EventEmitter {
  private interval: NodeJS.Timeout;
  private thresholdBytes: number;

  constructor(thresholdMb = 3000, pollIntervalMs = 1000) {
    super();
    this.thresholdBytes = thresholdMb * 1024 * 1024;

    this.interval = setInterval(() => {
      const used = process.memoryUsage().heapUsed;
      if (used > this.thresholdBytes) {
        this.emit("thresholdExceeded", {
          usedMb: (used / 1024 / 1024).toFixed(2),
          thresholdMb,
        });
      }
    }, pollIntervalMs);
  }

  stop() {
    clearInterval(this.interval);
  }
}

const monitor = new HeapMonitor(3000); // 3 GB

export const initHeapMonitor = () => {
  monitor.on("thresholdExceeded", ({ usedMb, thresholdMb }) => {
    console.warn(
      `[HeapMonitor] Heap usage exceeded ${thresholdMb}MB: ${usedMb}MB used`
    );
    resetTokenizedDocumentProvider();
    resetCachedCPreprocessorParserProvider();
  });
};
