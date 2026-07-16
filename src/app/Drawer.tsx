// Side drawer: the local workspace file list, new-file actions, bundled
// sample notebooks, and the optional Google Drive section. Overlays content
// on phones, docks on wide screens.
import { useEffect, useState } from 'preact/hooks';
import type { DriveFileMeta } from '../drive/client';
import type { WorkspaceFile } from '../files/store';
import { t } from '../i18n';

export interface SampleRef {
  name: string;
  path: string;
}

export type DriveStatus = 'unavailable' | 'disconnected' | 'connecting' | 'connected';

interface Props {
  open: boolean;
  files: Omit<WorkspaceFile, 'content'>[];
  currentId?: string;
  onClose(): void;
  onOpenFile(id: string): void;
  onNew(kind: 'ipynb' | 'py'): void;
  onRename(id: string): void;
  onDuplicate(id: string): void;
  onDelete(id: string): void;
  onImport(): void;
  onOpenSample(sample: SampleRef): void;
  drive: {
    status: DriveStatus;
    busy: boolean;
    files: DriveFileMeta[];
    /** Current file has edits newer than its last Drive upload. */
    currentDirty: boolean;
    currentLinked: boolean;
    onConnect(): void;
    onSignOut(): void;
    onSaveCurrent(): void;
    onOpenDriveFile(meta: DriveFileMeta): void;
  };
}

export function Drawer(props: Props) {
  const [samples, setSamples] = useState<SampleRef[]>([]);

  useEffect(() => {
    if (!props.open || samples.length) return;
    fetch(new URL('samples/index.json', document.baseURI))
      .then((r) => (r.ok ? r.json() : []))
      .then((list: SampleRef[]) => setSamples(list))
      .catch(() => setSamples([]));
  }, [props.open, samples.length]);

  return (
    <>
      {props.open && <div class="drawer-backdrop" onClick={props.onClose} />}
      <aside class={`drawer ${props.open ? 'drawer--open' : ''}`} aria-label={t('drawer.title')} aria-hidden={!props.open}>
        <div class="drawer__head">
          <span class="drawer__title">{t('drawer.files')}</span>
          <button class="iconbtn" onClick={props.onClose} title={t('drawer.close')} aria-label={t('drawer.close')}>
            ✕
          </button>
        </div>
        <div class="drawer__actions">
          <button class="btn btn--ghost btn--small" onClick={() => props.onNew('ipynb')}>
            + {t('drawer.newNotebook')}
          </button>
          <button class="btn btn--ghost btn--small" onClick={() => props.onNew('py')}>
            + {t('drawer.newScript')}
          </button>
          <button class="btn btn--ghost btn--small" onClick={props.onImport}>
            ⤒ {t('drawer.import')}
          </button>
        </div>
        <ul class="drawer__list">
          {props.files.map((f) => (
            <li key={f.id} class={`drawer__item ${f.id === props.currentId ? 'drawer__item--current' : ''}`}>
              <button class="drawer__file" onClick={() => props.onOpenFile(f.id)}>
                <span class="drawer__icon" aria-hidden="true">
                  {f.kind === 'ipynb' ? '📓' : '🐍'}
                </span>
                <span class="drawer__name">{f.name}</span>
                {f.driveId && (
                  <span class="drawer__cloud" title={t('drive.linked')} aria-label={t('drive.linked')}>
                    ☁
                  </span>
                )}
              </button>
              <span class="drawer__tools">
                <button class="cell__tool" title={t('drawer.rename')} aria-label={`${t('drawer.rename')} ${f.name}`} onClick={() => props.onRename(f.id)}>
                  ✎
                </button>
                <button class="cell__tool" title={t('drawer.duplicate')} aria-label={`${t('drawer.duplicate')} ${f.name}`} onClick={() => props.onDuplicate(f.id)}>
                  ⧉
                </button>
                <button class="cell__tool cell__tool--danger" title={t('drawer.delete')} aria-label={`${t('drawer.delete')} ${f.name}`} onClick={() => props.onDelete(f.id)}>
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
        {samples.length > 0 && (
          <>
            <div class="drawer__head drawer__head--sub">
              <span class="drawer__title">{t('drawer.samples')}</span>
            </div>
            <ul class="drawer__list">
              {samples.map((s) => (
                <li key={s.path} class="drawer__item">
                  <button class="drawer__file" onClick={() => props.onOpenSample(s)}>
                    <span class="drawer__icon" aria-hidden="true">
                      ✨
                    </span>
                    <span class="drawer__name">{s.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <DriveSection drive={props.drive} />
      </aside>
    </>
  );
}

function DriveSection({ drive }: { drive: Props['drive'] }) {
  if (drive.status === 'unavailable') return null;
  return (
    <>
      <div class="drawer__head drawer__head--sub">
        <span class="drawer__title">{t('drive.title')}</span>
      </div>
      {drive.status !== 'connected' ? (
        <div class="drawer__actions">
          <button
            class="btn btn--ghost btn--small"
            disabled={drive.status === 'connecting'}
            onClick={drive.onConnect}
          >
            {drive.status === 'connecting' ? t('drive.connecting') : t('drive.connect')}
          </button>
        </div>
      ) : (
        <>
          <div class="drawer__actions">
            <button class="btn btn--ghost btn--small" disabled={drive.busy} onClick={drive.onSaveCurrent}>
              ☁ {t('drive.saveCurrent')}
            </button>
            <button class="btn btn--ghost btn--small" onClick={drive.onSignOut}>
              {t('drive.signOut')}
            </button>
          </div>
          {drive.currentLinked && (
            <p class={`drive-state ${drive.currentDirty ? 'drive-state--dirty' : ''}`}>
              {drive.currentDirty ? t('drive.unsavedChanges') : t('drive.upToDate')}
            </p>
          )}
          <ul class="drawer__list">
            {drive.files.map((f) => (
              <li key={f.id} class="drawer__item">
                <button class="drawer__file" onClick={() => drive.onOpenDriveFile(f)}>
                  <span class="drawer__icon" aria-hidden="true">
                    ☁
                  </span>
                  <span class="drawer__name">{f.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
