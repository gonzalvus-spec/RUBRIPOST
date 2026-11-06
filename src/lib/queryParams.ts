/**
 * Query params de la URL.
 *
 * La URL es la única fuente de verdad: la tabla del panel Params se deriva de
 * ella y cada edición reescribe la URL. Así lo que se ve, lo que se guarda en
 * MongoDB y lo que se envía siempre coinciden.
 */

/** Fila editable de la tabla de query params. */
export interface QueryRow {
  id: string;
  key: string;
  value: string;
  description: string;
}

let querySequence = 0;

export const createQueryRow = (
  key = '',
  value = '',
  description = '',
): QueryRow => ({
  id: `query-${Date.now()}-${querySequence++}`,
  key,
  value,
  description,
});

const decode = (raw: string): string => {
  const texto = raw.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(texto);
  } catch {
    // Un `%` suelto en la URL no debe romper la tabla.
    return texto;
  }
};

/** Divide la URL en su parte base y los pares de query ya decodificados. */
export const splitQuery = (
  url: string,
): { base: string; pairs: Array<{ key: string; value: string }> } => {
  const sinFragmento = url.split('#')[0];
  const indice = sinFragmento.indexOf('?');
  if (indice < 0) return { base: sinFragmento, pairs: [] };

  const base = sinFragmento.slice(0, indice);
  const pairs: Array<{ key: string; value: string }> = [];

  for (const parte of sinFragmento.slice(indice + 1).split('&')) {
    if (!parte) continue;
    const igual = parte.indexOf('=');
    const clave = decode(igual >= 0 ? parte.slice(0, igual) : parte);
    const valor = igual >= 0 ? decode(parte.slice(igual + 1)) : '';
    // Un parámetro sin nombre no se puede editar en la tabla.
    if (!clave.trim()) continue;
    pairs.push({ key: clave, value: valor });
  }

  return { base, pairs };
};

/** Filas de la tabla derivadas de la URL (con sus descripciones guardadas). */
export const rowsFromUrl = (
  url: string,
  descripciones?: Record<string, string> | null,
): QueryRow[] =>
  splitQuery(url).pairs.map((pair) =>
    createQueryRow(pair.key, pair.value, descripciones?.[pair.key] ?? ''),
  );

/**
 * Reescribe la query de la URL a partir de las filas.
 * Las filas sin nombre se ignoran (quedan pendientes en la tabla).
 */
export const urlWithQuery = (url: string, rows: QueryRow[]): string => {
  const { base } = splitQuery(url);

  const partes = rows
    .map((row) => ({ key: row.key.trim(), value: row.value }))
    .filter((row) => row.key !== '')
    .map((row) =>
      row.value === ''
        ? encodeURIComponent(row.key)
        : `${encodeURIComponent(row.key)}=${encodeURIComponent(row.value)}`,
    );

  return partes.length > 0 ? `${base}?${partes.join('&')}` : base;
};
