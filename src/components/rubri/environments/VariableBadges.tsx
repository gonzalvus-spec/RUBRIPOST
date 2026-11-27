import clsx from 'clsx';
import { variableNamesIn } from '../../../lib/environmentVariables';
import { useEnvironmentStore } from '../../../store/environmentStore';
import './VariableBadges.css';

export const VariableBadges = ({ values }: { values: readonly string[] }) => {
  const environments = useEnvironmentStore((state) => state.environments);
  const activeId = useEnvironmentStore((state) => state.activeEnvironmentId);
  const active = environments.find((item) => item._id === activeId);
  const names = [...new Set(values.flatMap(variableNamesIn))];
  if (names.length === 0) return null;
  return <div className="variable-badges" aria-label="Variables detectadas">{names.map((name) => {
    const variable = active?.variables.find((item) => item.enabled && item.key === name);
    return <span key={name} className={clsx({ resolved: variable?.type === 'default', secret: variable?.type === 'secret', missing: !variable })} title={variable ? `${name} = ${variable.value}` : `${name} no está definida en el Environment activo`}>{`{{${name}}}`}</span>;
  })}</div>;
};
