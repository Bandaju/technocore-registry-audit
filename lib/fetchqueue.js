"use strict";

// Every number is a knob. Defaults are polite to a public, unauthenticated
// service; override any of them from the CLI.
const DEFAULTS = {
  concurrency: 6,
  request_timeout_in_ms: 8000,
  retry_count: 2,
  retry_delay_in_ms: 1500,
  delay_between_requests_in_ms: 50,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createFetchQueue(options = {}) {
  const config = { ...DEFAULTS, ...options };
  const stats = { requests: 0, retries: 0, failures: 0 };

  async function fetchTextOnce(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.request_timeout_in_ms);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { "user-agent": "technocore-registry-audit (read-only auditor)" },
      });
      // 404 is a definitive answer (key does not exist), not a transient error.
      if (response.status === 404) return { ok: true, status: 404, text: "" };
      if (!response.ok) return { ok: false, status: response.status, text: "" };
      return { ok: true, status: response.status, text: await response.text() };
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchText(url) {
    stats.requests += 1;
    for (let attempt = 0; ; attempt += 1) {
      try {
        const result = await fetchTextOnce(url);
        if (result.ok) return result;
        if (attempt >= config.retry_count) {
          stats.failures += 1;
          return result;
        }
      } catch (error) {
        if (attempt >= config.retry_count) {
          stats.failures += 1;
          return { ok: false, status: 0, text: "", error: error.message };
        }
      }
      stats.retries += 1;
      await sleep(config.retry_delay_in_ms * (attempt + 1));
    }
  }

  // Maps worker(item) over items with bounded concurrency, preserving order.
  // onProgress(done, total) fires after each item for CLI progress output.
  async function mapConcurrent(items, worker, onProgress) {
    const results = new Array(items.length);
    let next = 0;
    let done = 0;

    async function lane() {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index], index);
        done += 1;
        if (onProgress) onProgress(done, items.length);
        if (config.delay_between_requests_in_ms > 0) {
          await sleep(config.delay_between_requests_in_ms);
        }
      }
    }

    const laneCount = Math.max(1, Math.min(config.concurrency, items.length));
    await Promise.all(Array.from({ length: laneCount }, lane));
    return results;
  }

  return { config, stats, fetchText, mapConcurrent };
}

module.exports = { createFetchQueue, DEFAULTS };
