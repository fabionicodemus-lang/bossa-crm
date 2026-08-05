export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const relative = specifier.startsWith('./') || specifier.startsWith('../');
    const hasExtension = /\.[cm]?[jt]sx?$/.test(specifier);
    if (relative && !hasExtension) {
      for (const extension of ['.ts', '.tsx']) {
        try {
          return await nextResolve(`${specifier}${extension}`, context);
        } catch {
          // Tenta a próxima extensão.
        }
      }
    }
    throw error;
  }
}
