import { createStore, type StoreApi } from 'zustand/vanilla';
import type { CrudStoreState } from './crud';

export interface CrudIndexStoreState<T, Key> {
  index: Map<Key, T>;

  find (key: Key): T | undefined;
}

export interface CreateCurdIndexStoreOptions<T, Key> {
  getKey: (item: T) => Key;
}

export function createCrudIndexStore<T, Key, IdColumn extends keyof T> (
  store: StoreApi<CrudStoreState<T, IdColumn>>,
  { getKey }: CreateCurdIndexStoreOptions<T, Key>,
) {
  const indexMap = new Map<Key, T>();

  store.getState().entities.forEach(item => {
    indexMap.set(getKey(item), item);
  });

  const indexStore = createStore<CrudIndexStoreState<T, Key>>((_, get) => ({
    index: indexMap,
    find: key => get().index.get(key),
  }));

  store.setState(state => ({
    ...state,
    __mutationSubscribers: [
      ...state.__mutationSubscribers,
      items => {
        items.forEach(item => {
          const state = store.getState();
          const realItem = state.entities.get(item[state.__idColumn]);
          if (realItem) {
            indexStore.setState(state => ({
              index: new Map(state.index).set(getKey(realItem), realItem),
            }));
          } else {
            indexStore.setState(state => {
              state = {
                ...state,
                index: new Map(state.index),
              };
              state.index.delete(getKey(item));
              return state;
            });
          }
        });
      },
    ],
  }));

  return indexStore;
}
