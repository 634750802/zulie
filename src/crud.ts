import { shallow } from 'zustand/shallow';
import { createStore, type StoreApi } from 'zustand/vanilla';

type CrudStoreItemMutationsSubscriber<T> = (items: T[]) => void;

type KeyOfType<T, TValue> = {
  [P in keyof T]: T[P] extends TValue ? P : never
}[keyof T];

export interface CrudStoreState<T, IdColumn extends keyof T> {
  entities: Map<T[IdColumn], T>;

  __idColumn: IdColumn;
  __mutationSubscribers: CrudStoreItemMutationsSubscriber<T>[];

  size (): number;

  find (id: T[IdColumn]): T | undefined;

  filter (fn: (item: T) => boolean): T[];

  upsert (values: T[]): void;

  del (ids?: T[IdColumn][]): void;
}

export type CrudStore<T, IdColumn extends keyof T> = StoreApi<CrudStoreState<T, IdColumn>>

export interface CreateCrudStoreOptions<T, IdColumn extends keyof T> {
  idColumn: IdColumn;
}

export function createCrudStore<T, IdColumn extends keyof T = keyof T> ({ idColumn }: CreateCrudStoreOptions<T, IdColumn>) {
  return createStore<CrudStoreState<T, IdColumn>>((set, get, store) => ({
    entities: new Map(),
    __idColumn: idColumn,
    __mutationSubscribers: [],
    size: () => get().entities.size,
    find: (id: T[IdColumn]) => get().entities.get(id),
    filter: (fn: (item: T) => boolean) => Array.from(get().entities.values()).filter(fn),
    upsert: (values: T[]) => {
      set(upsertImpl(idColumn, values));
      if (__changed) {
        get().__mutationSubscribers.forEach(subscriber => subscriber(__changed as T[]));
        __changed = undefined;
      }
    },
    del: (ids?: T[IdColumn][]) => {
      set(delImpl(ids));
      if (__changed) {
        get().__mutationSubscribers.forEach(subscriber => subscriber(__changed as T[]));
        __changed = undefined;
      }
    },
  }));
}

export function persistTo<T, IdColumn extends keyof T> (store: CrudStore<T, IdColumn>): (value: T) => T {
  return (value) => {
    store.getState().upsert([value]);
    return value;
  };
}

export function persistAllTo<T, IdColumn extends keyof T> (store: CrudStore<T, IdColumn>): (value: T[]) => T[] {
  return (value) => {
    store.getState().upsert(value);
    return value;
  };
}

/**
 * @deprecated
 * @param store
 * @param fallback
 */
export function makeAutoBulkRetriever<T, IdColumn extends keyof T> (store: CrudStore<T, IdColumn>, fallback: (ids: T[IdColumn][], abortSignal?: AbortSignal) => Promise<T[]>) {
  const persist = persistAllTo(store);
  const promiseCache = new Map<T[IdColumn], Promise<T>>();

  const { find } = store.getState();

  function decoupleFetchingIds (ids: T[IdColumn][], force?: boolean) {
    if (force) {
      return {
        fetch: new Set<T[IdColumn]>(ids),
        wait: new Set<T[IdColumn]>(),
        exists: new Set<T[IdColumn]>(),
      };
    } else {
      const set = new Set(ids);
      const exists = ids.filter(find);
      exists.forEach(id => set.delete(id));
      const wait = ids.filter(id => promiseCache.has(id));
      wait.forEach(id => set.delete(id));

      return {
        exists: new Set(exists),
        wait: new Set(wait),
        fetch: set,
      };
    }
  }

  return async (ids: T[IdColumn][], force?: boolean) => {
    const { fetch, exists, wait } = decoupleFetchingIds(ids, force);

    if (fetch.size === 0) {
      return Promise.all(ids.map(id => {
        if (exists.has(id)) {
          return find(id)!;
        } else {
          return promiseCache.get(id)!;
        }
      }));
    }

    const fetchPromise = fallback([...fetch]).then(persist);

    fetch.forEach(id => {
      promiseCache.set(id, fetchPromise.then(() => find(id)!).finally(() => {
        promiseCache.delete(id);
      }));
    });

    await fetchPromise;

    return Promise.all(ids.map(id => {
      if (wait.has(id)) {
        return promiseCache.get(id)!;
      } else {
        return find(id)!;
      }
    }));
  };

}

export function makeRetriever<T, IdColumn extends keyof T> (store: CrudStore<T, IdColumn>, fallback: (id: T[IdColumn], abortSignal?: AbortSignal) => Promise<T>) {
  const persist = persistTo(store);
  const promiseCache = new Map<T[IdColumn], Promise<T>>();
  const acCache = new Map<T[IdColumn], AbortController>();

  return (id: T[IdColumn], force?: boolean) => {
    if (!force) {
      const res = store.getState().find(id);
      if (res !== undefined) {
        return Promise.resolve(res);
      }
    }

    let promise = promiseCache.get(id);
    if (promise) {
      if (!force) {
        return promise;
      }
      // if forced, abort previous
      acCache.get(id)?.abort('force abort');
    }

    const ac = new AbortController();
    promise = fallback(id, ac.signal).then(persist).finally(() => {
      promiseCache.delete(id);
      acCache.delete(id);
    });
    promiseCache.set(id, promise);
    acCache.set(id, ac);
    return promise;
  };
}

let __changed: any[] | undefined;

const upsertImpl = <T, IdColumn extends keyof T> (idColumn: IdColumn, values: T[]) => (store: CrudStoreState<T, IdColumn>): { entities: Map<T[IdColumn], T>, changed: T[] } | {} => {
  if (values.length === 0) {
    return store;
  }
  let { entities } = store;
  const changed: T[] = [];
  entities = new Map(entities);
  values.forEach(value => {
    const id = value[idColumn];
    const prev = entities.get(id);
    if (prev) {
      if (!shallow(prev, value)) {
        entities.set(id, value);
        changed.push(value);
      }
    } else {
      entities.set(id, value);
      changed.push(value);
    }
  });
  if (changed.length > 0) {
    __changed = changed;
    return { entities };
  } else {
    return store;
  }
};

const delImpl = <T, IdColumn extends keyof T> (ids?: T[IdColumn][]) => (store: CrudStoreState<T, IdColumn>): Partial<CrudStoreState<T, IdColumn>> => {
  const changed: T[] = [];
  if (!ids) {
    if (store.entities.size > 0) {
      return { entities: new Map() };
    } else {
      return store;
    }
  }

  if (ids.length === 0) {
    return store;
  }
  let { entities } = store;
  entities = new Map(entities);

  ids.forEach(id => {
    const entity = entities.get(id);
    if (entity) {
      entities.delete(id);
      changed.push(entity);
    }
  });

  if (changed.length > 0) {
    __changed = changed;
    return { entities };
  } else {
    return store;
  }
};
