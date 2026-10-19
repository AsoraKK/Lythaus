export async function waitForLoginFunction(page, boundary, predicate) {
  const startedAt = Date.now();
  try {
    return await page.waitForFunction(predicate);
  } catch (error) {
    const errorStack = typeof error?.stack === 'string' ? error.stack : null;
    const pageState = await page.evaluate(() => {
      const activeElement = document.activeElement;
      const input = activeElement instanceof HTMLInputElement ? activeElement : null;
      return {
        url: location.href,
        readyState: document.readyState,
        firstFrameAt: Number.isFinite(window.__brandFirstFrameAt) ? window.__brandFirstFrameAt : null,
        browserTimeMs: performance.now(),
        viewport: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
        activeElement: activeElement ? {
          tagName: activeElement.tagName,
          id: activeElement.id || null,
          name: activeElement.getAttribute('name'),
          type: input?.type ?? null,
          ariaLabel: activeElement.getAttribute('aria-label'),
          focused: activeElement !== document.body,
          valueLength: input?.value.length ?? null,
          hasExpectedDraft: input?.value === 'draft@example.invalid'
        } : null
      };
    }).catch(observationError => ({ observationError: observationError?.message ?? String(observationError) }));
    const message = error instanceof Error ? error.message : String(error);
    const diagnostics = { boundary, elapsedMs: Date.now() - startedAt, errorStack, pageState };
    throw new Error(`${message}\nWait diagnostics: ${JSON.stringify(diagnostics)}`, { cause: error });
  }
}
