export const withTimeout = async <T>(
  operation: Promise<T>,
  timeoutMs: number,
  message = 'La operación tardó demasiado. Comprueba tu conexión a internet.',
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
};
