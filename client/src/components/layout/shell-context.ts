import { createContext, useContext } from 'solid-js';
import type { Notebook } from '../../api/models/notebook';

export type ShellActions = {
  openCreate(isDiary?: boolean): void;
  openRename(notebook: Notebook): void;
  openDelete(notebook: Notebook): void;
};

const noop: ShellActions = { openCreate() {}, openRename() {}, openDelete() {} };

export const ShellContext = createContext<ShellActions>(noop);

export const useShell = () => useContext(ShellContext);
