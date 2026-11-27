import type { EnvironmentVariable } from '../store/environmentStore';

const VARIABLE_PATTERN = /{{\s*([A-Za-z_][\w.-]*)\s*}}/g;

export interface VariableResolution {
  value: string;
  missing: string[];
}

export const activeVariableMap = (
  variables: readonly EnvironmentVariable[],
): Record<string, string> => Object.fromEntries(
  variables
    .filter((variable) => variable.enabled && variable.key.trim())
    .map((variable) => [variable.key.trim(), variable.value]),
);

/** Sustituye variables activas y conserva en rojo/diagnóstico las desconocidas. */
export const resolveEnvironmentVariables = (
  input: string,
  variables: Readonly<Record<string, string>>,
): VariableResolution => {
  const missing = new Set<string>();
  const value = input.replace(VARIABLE_PATTERN, (match, rawName: string) => {
    const name = rawName.trim();
    if (!Object.prototype.hasOwnProperty.call(variables, name)) {
      missing.add(name);
      return match;
    }
    return variables[name];
  });
  return { value, missing: [...missing] };
};

export const variableNamesIn = (input: string): string[] => {
  const names = new Set<string>();
  for (const match of input.matchAll(VARIABLE_PATTERN)) names.add(match[1].trim());
  return [...names];
};
