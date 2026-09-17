async function optionalImport(specifier) {
  try {
    return await import(specifier);
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND") {
      return null;
    }
    throw error;
  }
}

// The scoring engine and the paid report belong to the quiz workstream and may
// not be deployed yet; callers answer "unavailable" instead of crashing.
export async function loadKissScore() {
  const mod = await optionalImport("./kiss-score.cjs");
  return mod ? mod.default ?? mod : null;
}

export async function loadKissReport() {
  return optionalImport("./kiss-report.js");
}
