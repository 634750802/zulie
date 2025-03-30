import { expect, suite, test, vitest } from 'vitest';

import { createCrudStore } from './crud';

type Foo = {
  id: number
  bar: string
}

suite('createCrudStore', () => {
  test('basic', () => {
    const store = createCrudStore<Foo, 'id'>({
      idColumn: 'id',
    });

    const { upsert, del, find, size } = store.getState();

    expect(size()).toEqual(0);

    upsert([{ id: 1, bar: 'hello' }]);
    expect(size()).toEqual(1);
    expect(find(1)?.bar).toEqual('hello');

    upsert([{ id: 1, bar: 'world' }]);
    expect(size()).toEqual(1);
    expect(find(1)?.bar).toEqual('world');

    upsert([{ id: 2, bar: 'hi world' }]);
    expect(size()).toEqual(2);
    expect(find(2)?.bar).toEqual('hi world');

    del([1]);
    expect(size()).toEqual(1);
    expect(find(1)).toBeUndefined();
    expect(find(2)?.bar).toEqual('hi world');
  });

  test('shallow update', () => {
    const store = createCrudStore<Foo, 'id'>({
      idColumn: 'id',
    });

    const { upsert, del, find, size } = store.getState();

    const sub = vitest.fn();
    store.subscribe(sub);

    upsert([{ id: 1, bar: 'hello' }]);
    expect(sub).toHaveBeenCalledTimes(1);

    upsert([{ id: 1, bar: 'hello' }]);
    expect(sub).toHaveBeenCalledTimes(1);

    upsert([{ id: 1, bar: 'hi' }]);
    expect(sub).toHaveBeenCalledTimes(2);

    upsert([]);
    expect(sub).toHaveBeenCalledTimes(2);

    del([]);
    expect(sub).toHaveBeenCalledTimes(2);

    del([1]);
    expect(sub).toHaveBeenCalledTimes(3);

    del([1]);
    expect(sub).toHaveBeenCalledTimes(3);
  });
});
