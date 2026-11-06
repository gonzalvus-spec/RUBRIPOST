import { useMemo } from 'react';
import { ChevronRight, TriangleAlert } from 'lucide-react';

import { useApiStore, type ApiCollection } from '../../../store/apiStore';
import { RubriCollectionMenu } from './RubriCollectionMenu';
import './RubriRequestHeader.css';

interface RubriRequestHeaderProps {
  collections: ApiCollection[];
  lastSavedId: string | null;
  isDirty: boolean;
  onChangeCollection: (collectionId: string) => void;
  onNewCollection: () => void;
}

export const RubriRequestHeader = ({
  collections,
  lastSavedId,
  isDirty,
  onChangeCollection,
  onNewCollection,
}: RubriRequestHeaderProps) => {
  const nombre = useApiStore((state) => state.nombre);
  const coleccionId = useApiStore((state) => state.coleccionId);
  const savedRequests = useApiStore((state) => state.savedRequests);
  const setNombre = useApiStore((state) => state.setNombre);

  const counts = useMemo(() => {
    const conteo: Record<string, number> = {};
    for (const request of savedRequests) {
      if (!request.coleccion_id) continue;
      conteo[request.coleccion_id] = (conteo[request.coleccion_id] ?? 0) + 1;
    }
    return conteo;
  }, [savedRequests]);

  return (
    <div className="main-head">
      <div className="crumb-row">
        <RubriCollectionMenu
          collections={collections}
          activeId={coleccionId}
          counts={counts}
          onSelect={onChangeCollection}
          onNewCollection={onNewCollection}
        />

        <ChevronRight size={13} className="crumb-sep" />

        <input
          type="text"
          className="request-title"
          value={nombre}
          placeholder="Sin título"
          aria-label="Nombre de la request"
          title="Nombre de la request"
          onChange={(event) => setNombre(event.target.value)}
        />

        {isDirty && !lastSavedId && (
          <span className="badge-unsaved">
            <TriangleAlert size={11} />
            Sin guardar
          </span>
        )}
        {isDirty && lastSavedId && (
          <span className="badge-dirty" title="Cambios sin guardar">
            <span className="dirty-dot" />
            Cambios sin guardar
          </span>
        )}
      </div>
    </div>
  );
};

export default RubriRequestHeader;
