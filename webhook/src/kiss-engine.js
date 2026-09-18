function missingModule(error) {
  return error?.code === "ERR_MODULE_NOT_FOUND";
}

// The scoring engine and the paid report belong to the quiz workstream and may
// not be deployed yet; callers answer "unavailable" instead of crashing. The
// specifiers stay literal so Vercel's file tracer bundles the modules.
export async function loadKissScore() {
  try {
    const mod = await import("./kiss-score.cjs");
    return mod.default ?? mod;
  } catch (error) {
    if (missingModule(error)) {
      return null;
    }
    throw error;
  }
}

export async function loadKissReport() {
  try {
    return await import("./kiss-report.js");
  } catch (error) {
    if (missingModule(error)) {
      return null;
    }
    throw error;
  }
}
