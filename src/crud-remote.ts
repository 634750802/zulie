import { createStore, type StoreApi } from 'zustand/vanilla';
import type { CrudStoreState } from './crud';

export interface CrudFindInterface<T, Data> {
  find (data: Data): T | undefined;
}

export interface CrudRemoteState<T, Column extends keyof T> {
  loading: Set<T[Column]>;
  error: Map<T[Column], unknown>;

  requestRemote (columns: T[Column][], force?: boolean): void;
}

export interface CreateCrudRemoteOptions<T, Column extends keyof T> {
  column: Column;

  request (columns: T[Column][]): Promise<T[]>;
}

export function createRemoteCrud<T, Column extends keyof T> (
  store: StoreApi<CrudStoreState<T, any>>,
  findInterface: StoreApi<CrudFindInterface<T, T[Column]>>,
  { request }: CreateCrudRemoteOptions<T, Column>,
) {
  return createStore<CrudRemoteState<T, Column>>((setState, getState) => ({
    loading: new Set(),
    error: new Map(),
    requestRemote (columns, force) {
      const remoteState = getState();
      const find = findInterface.getState().find;

      if (!force) {
        columns = columns
          .filter(column => !(
            find(column) != null ||
            remoteState.loading.has(column) ||
            remoteState.error.has(column)
          ));
      }

      setState(state => ({
        ...state,
        loading: new Set([...state.loading, ...columns]),
      }));

      request(columns)
        .then(items => {
          store.getState().upsert(items);
          setState(state => ({
            ...state,
            loading: new Set([...state.loading].filter(column => !columns.includes(column))),
          }));
        })
        .catch(error => {
          setState(state => ({
            ...state,
            error: new Map([...state.error.entries(), ...columns.map(column => [column, error] as const)]),
          }));
        });
    },
  }));
}
