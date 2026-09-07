import { api } from './api';
export function InboxTools({
  cursor,
  next,
  back,
  older,
  ids,
  kind,
  act,
  archived,
  setArchived,
}: {
  cursor: number | null;
  next: number | null;
  back: () => void;
  older: () => void;
  ids: number[];
  kind: string;
  act: any;
  archived: boolean;
  setArchived: (value: boolean) => void;
}) {
  return (
    <div className="inbox-tools">
      <div className="admin-actions">
        <button
          className="button outline"
          disabled={!ids.length}
          onClick={() =>
            act(() => api(`/${kind}/bulk`, { ids, action: 'read' }), 'Page marked read')
          }
        >
          Mark page read
        </button>
        <button
          className="button outline"
          disabled={!ids.length}
          onClick={() =>
            act(
              () => api(`/${kind}/bulk`, { ids, action: archived ? 'restore' : 'archive' }),
              archived ? 'Page restored' : 'Page archived',
            )
          }
        >
          {archived ? 'Restore page' : 'Archive page'}
        </button>
        <button className="text-button" onClick={() => setArchived(!archived)}>
          {archived ? 'Back to inbox' : 'Show archive'}
        </button>
      </div>
      <div className="admin-actions">
        <button className="button outline" disabled={!cursor} onClick={back}>
          Newer
        </button>
        <button className="button outline" disabled={!next} onClick={older}>
          Older
        </button>
      </div>
    </div>
  );
}
