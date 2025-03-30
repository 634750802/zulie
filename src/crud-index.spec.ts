import { expect, suite, test } from 'vitest';
import { createCrudStore } from './crud';
import { createCrudIndexStore } from './crud-index';

type Foo = {
  id: number
  key: string
  bar: string
}

suite('crud-index', () => {
  test('initial', () => {
    const store = createCrudStore<Foo, 'id'>({ idColumn: 'id' });

    store.getState().upsert([{ id: 1, key: 'a', bar: 'hello' }]);

    const index = createCrudIndexStore(store, { getKey: (x) => x.key });
    expect(index.getState().find('a')).toStrictEqual({
      id: 1,
      key: 'a',
      bar: 'hello',
    });
  });

  test('upsert', () => {
    const store = createCrudStore<Foo, 'id'>({ idColumn: 'id' });
    const index = createCrudIndexStore(store, { getKey: (x) => x.key });

    store.getState().upsert([{ id: 1, key: 'a', bar: 'hello' }]);
    expect(index.getState().find('a')).toStrictEqual({
      id: 1,
      key: 'a',
      bar: 'hello',
    });

    store.getState().upsert([
      { id: 2, key: 'b', bar: 'world' },
      { id: 3, key: 'c', bar: 'hi' },
    ]);

    expect(index.getState().find('b')).toStrictEqual({
      id: 2,
      key: 'b',
      bar: 'world',
    });
    expect(index.getState().find('c')).toStrictEqual({
      id: 3,
      key: 'c',
      bar: 'hi',
    });
  });

  test('del', () => {
    const store = createCrudStore<Foo, 'id'>({ idColumn: 'id' });

    store.getState().upsert([{ id: 1, key: 'a', bar: 'hello' }]);

    const index = createCrudIndexStore(store, { getKey: (x) => x.key });

    store.getState().del([1]);

    expect(index.getState().find('a')).toBeUndefined();
  })
});
