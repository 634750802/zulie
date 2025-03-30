import { expect, suite, test } from 'vitest';
import { createCrudStore } from './crud';
import { createCrudIndexStore } from './crud-index';
import { createRemoteCrud } from './crud-remote';

type Foo = {
  id: number
  key: string
  bar: string
}

suite('remote', () => {
  test('basic', async () => {
    const store = createCrudStore<Foo, 'id'>({ idColumn: 'id' });
    const index = createCrudIndexStore(store, { getKey: (x) => x.key });
    let last: ControlledPromise<Foo[]> | undefined;
    const remote = createRemoteCrud(store, index, {
      column: 'key',
      request (columns: string[]) {
        return last = new ControlledPromise<Foo[]>();
      },
    });

    remote.getState().requestRemote(['a']);

    expect(remote.getState().loading.has('a')).toBeTruthy();
    expect(store.getState().find(1)).toBeUndefined();
    expect(index.getState().find('a')).toBeUndefined();

    last?.$resolve([{ id: 1, key: 'a', bar: 'bar' }]);
    await last;

    expect(remote.getState().loading.has('a')).toBeFalsy();
    expect(remote.getState().error.has('a')).toBeFalsy();
    expect(store.getState().find(1)).toStrictEqual({
      id: 1,
      key: 'a',
      bar: 'bar',
    });
    expect(index.getState().find('a')).toStrictEqual({
      id: 1,
      key: 'a',
      bar: 'bar',
    });

  });
});

class ControlledPromise<T> extends Promise<T> {
  readonly $resolve!: (value: T) => void;
  readonly $reject!: (reason?: any) => void;

  constructor (cb = (resolve: any, reject: any) => {}) {
    let _resolve!: (value: T) => void;
    let _reject!: (reason?: any) => void;
    super((resolve, reject) => {
      _resolve = resolve;
      _reject = reject;
      return cb(resolve, reject);
    });
    this.$resolve = _resolve.bind(undefined);
    this.$reject = _reject.bind(undefined);
  }
}