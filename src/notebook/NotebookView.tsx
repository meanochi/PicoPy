// The cell list plus add-cell controls at the bottom.
import { t } from '../i18n';
import { CellView, type CellActions } from './CellView';
import type { Notebook } from './model';

interface Props extends CellActions {
  notebook: Notebook;
  /** Remount key prefix so loading a new file recreates cell editors. */
  generation: number;
  runningCellId?: string;
  stdinActive: boolean;
  onAddCode(): void;
  onAddText(): void;
}

export function NotebookView(props: Props) {
  const { cells } = props.notebook;
  return (
    <div class="notebook">
      {cells.map((cell, i) => (
        <CellView
          key={`${props.generation}:${cell.id}`}
          cell={cell}
          isRunning={props.runningCellId === cell.id}
          stdinActive={props.stdinActive && props.runningCellId === cell.id}
          isFirst={i === 0}
          isLast={i === cells.length - 1}
          onRun={props.onRun}
          onChange={props.onChange}
          onMove={props.onMove}
          onDelete={props.onDelete}
          onSetRendered={props.onSetRendered}
          onStdin={props.onStdin}
        />
      ))}
      <div class="notebook__add">
        <button class="btn btn--ghost" onClick={props.onAddCode}>
          + {t('action.addCode')}
        </button>
        <button class="btn btn--ghost" onClick={props.onAddText}>
          + {t('action.addText')}
        </button>
      </div>
    </div>
  );
}
