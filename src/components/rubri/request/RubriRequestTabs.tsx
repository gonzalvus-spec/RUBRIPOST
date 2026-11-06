import clsx from 'clsx';

import { splitQuery } from '../../../lib/queryParams';
import { useApiStore } from '../../../store/apiStore';
import type { TabId } from '../types';
import './RubriRequestTabs.css';

interface RubriRequestTabsProps {
  activeTab: TabId;
  jsonErrors: number;
  onChange: (tab: TabId) => void;
}

export const RubriRequestTabs = ({
  activeTab,
  jsonErrors,
  onChange,
}: RubriRequestTabsProps) => {
  const body = useApiStore((state) => state.body);
  const url = useApiStore((state) => state.url);
  const headerRows = useApiStore((state) => state.headerRows);
  const activeHeaders = headerRows.filter(
    (row) => row.enabled && row.key.trim(),
  ).length;
  const queryParams = splitQuery(url).pairs.length;

  return (
    <div className="req-tabs" role="tablist" aria-label="Secciones de la request">
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'params'}
        aria-label="Pestaña Params"
        className={clsx('req-tab', { active: activeTab === 'params' })}
        onClick={() => onChange('params')}
      >
        Params
        {queryParams > 0 && <span className="tab-count">{queryParams}</span>}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'body'}
        aria-label="Pestaña Body"
        className={clsx('req-tab', { active: activeTab === 'body' })}
        onClick={() => onChange('body')}
      >
        Body
        {body.trim() !== '' && jsonErrors > 0 && (
          <span className="tab-error">{jsonErrors}</span>
        )}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'auth'}
        aria-label="Pestaña Auth"
        className={clsx('req-tab', { active: activeTab === 'auth' })}
        onClick={() => onChange('auth')}
      >
        Auth
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'headers'}
        aria-label="Pestaña Headers"
        className={clsx('req-tab', { active: activeTab === 'headers' })}
        onClick={() => onChange('headers')}
      >
        Headers
        {activeHeaders > 0 && <span className="tab-count">{activeHeaders}</span>}
      </button>
    </div>
  );
};

export default RubriRequestTabs;
