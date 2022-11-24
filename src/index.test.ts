import { AsyncEventEmitter, errorMonitor } from './index.js';

enum EventName {
  Pre = 'pre',
  Post = 'post',
}

type EventMap = {
  [EventName.Pre]: { at: number };
  [EventName.Post]: { took: number };
};

enum NumericEventName {
  Pre,
  Post,
}

type NumericEventMap = {
  [NumericEventName.Pre]: { at: number };
  [NumericEventName.Post]: { took: number };
};

const pre = Symbol('Pre');
const post = Symbol('Post');

type SymbolEventMap = {
  [pre]: { at: number };
  [post]: { took: number };
};

describe('EventEmitter', () => {
  it('works with string event names', async () => {
    const ee = new AsyncEventEmitter<EventMap>();

    const result: any = {};

    const firstOffPre = ee.on(EventName.Pre, ({ at }) => {
      result.first = at;
    });

    const secondOffPre = ee.on(EventName.Pre, ({ at }) => {
      result.second = 2 * at;
    });

    const offPost = ee.on(EventName.Post, async ({ took }) => {
      result.took = took;
    });

    expect(result).toEqual({});

    await ee.emit(EventName.Pre, { at: 2000 });

    expect(result).toEqual({
      first: 2000,
      second: 4000,
    });

    await ee.emit(EventName.Post, { took: 100 });

    expect(result).toEqual({
      first: 2000,
      second: 4000,
      took: 100,
    });

    expect(ee.eventNames()).toEqual(['pre', 'post']);

    firstOffPre();

    expect(ee.eventNames()).toEqual(['pre', 'post']);

    offPost();

    expect(ee.eventNames()).toEqual(['pre']);

    secondOffPre();

    expect(ee.eventNames()).toEqual([]);

    await ee.emit(EventName.Pre, { at: 10000 });

    expect(ee.eventNames()).toEqual([]);

    expect(result).toEqual({
      first: 2000,
      second: 4000,
      took: 100,
    });
  });

  it('works with numeric event names', () => {
    const ee = new AsyncEventEmitter<NumericEventMap>();

    const firstOffPre = ee.on(NumericEventName.Pre, () => {});
    const secondOffPre = ee.on(NumericEventName.Pre, () => {});
    const offPost = ee.on(NumericEventName.Post, async () => {});

    expect(ee.eventNames()).toEqual([
      NumericEventName.Pre,
      NumericEventName.Post,
    ]);

    firstOffPre();
    expect(ee.eventNames()).toEqual([
      NumericEventName.Pre,
      NumericEventName.Post,
    ]);

    offPost();
    expect(ee.eventNames()).toEqual([NumericEventName.Pre]);

    secondOffPre();
    expect(ee.eventNames()).toEqual([]);
  });

  it('works with symbol event names', () => {
    const ee = new AsyncEventEmitter<SymbolEventMap>();

    const firstOffPre = ee.on(pre, () => {});
    const secondOffPre = ee.on(pre, () => {});
    const offPost = ee.on(post, async () => {});

    expect(ee.eventNames()).toEqual([pre, post]);

    firstOffPre();
    expect(ee.eventNames()).toEqual([pre, post]);

    offPost();
    expect(ee.eventNames()).toEqual([pre]);

    secondOffPre();
    expect(ee.eventNames()).toEqual([]);
  });

  it('on "config" works with string event names', () => {
    const ee = new AsyncEventEmitter<EventMap>();

    const offs = ee.on({
      // Several listeners for this event
      [EventName.Pre]: [() => {}, () => {}],
      // Only one here
      [EventName.Post]: () => {},

      error: (error) => {},
    });

    expect(ee.eventNames()).toEqual([EventName.Pre, EventName.Post, 'error']);

    offs.forEach((off) => off());
    expect(ee.eventNames()).toEqual([]);
  });

  it('on "config" works with symbol event names', () => {
    const ee = new AsyncEventEmitter<SymbolEventMap>();

    const offs = ee.on({
      // Several listeners for this event
      [pre]: [() => {}, () => {}],
      // Only one here
      [post]: () => {},
      // Only one for the errorMonitor
      [errorMonitor]: () => {},
    });

    expect(ee.eventNames()).toEqual([pre, post, errorMonitor]);

    offs.forEach((off) => off());
    expect(ee.eventNames()).toEqual([]);
  });

  it('works without typing', async () => {
    const ee = new AsyncEventEmitter();

    ee.on('notdDefinedEventName', () => {});

    await ee.emit('alsoNotdDefinedEventName', {});
  });

  it('once works', async () => {
    const ee = new AsyncEventEmitter<{ [EventName.Pre]: {} }>();

    let count: number = 0;

    ee.once(EventName.Pre, () => {
      count++;
    });

    ee.once(EventName.Pre, () => {
      count++;
    });

    expect(count).toEqual(0);
    expect(ee.eventNames()).toEqual(['pre']);

    await ee.emit(EventName.Pre, {});

    expect(count).toEqual(2);
    expect(ee.eventNames()).toEqual([]);

    await ee.emit(EventName.Pre, {});

    expect(count).toEqual(2);
    expect(ee.eventNames()).toEqual([]);
  });

  it('wait works', async () => {
    const ee = new AsyncEventEmitter<{ [EventName.Pre]: {} }>();

    await expect(ee.wait(EventName.Pre, 100)).rejects.toMatchInlineSnapshot(
      `[Error: Has waited for the "pre" event more than 100ms]`,
    );

    expect(ee.eventNames()).toEqual([]);

    const wait = ee.wait(EventName.Pre, 100);

    expect(ee.eventNames()).toEqual(['pre']);

    const [waited] = await Promise.all([
      wait,
      ee.emit(EventName.Pre, { test: 'wait' }),
    ]);

    expect(waited).toEqual({
      test: 'wait',
    });

    expect(ee.eventNames()).toEqual([]);
  });

  it('handle errors properly', async () => {
    const config = {
      myEventName: () => {
        throw new Error('An error');
      },
    };

    const eventEmitterWithoutErrorListener = new AsyncEventEmitter(config);

    await expect(
      eventEmitterWithoutErrorListener.emit('myEventName', null),
    ).rejects.toThrowErrorMatchingInlineSnapshot(`"An error"`);

    const eventEmitterWithErrorMonitorListener = new AsyncEventEmitter({
      ...config,

      [errorMonitor]: (error) => {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toEqual('An error');
      },
    });

    await expect(
      eventEmitterWithErrorMonitorListener.emit('myEventName', null),
    ).rejects.toThrowErrorMatchingInlineSnapshot(`"An error"`);

    const eventEmitterWithErrorListener = new AsyncEventEmitter({
      ...config,

      [errorMonitor]: (error) => {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toEqual('An error');
      },

      error: (error) => {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toEqual('An error');
      },
    });

    await expect(
      eventEmitterWithErrorListener.emit('myEventName', null),
    ).resolves.toBeUndefined();

    expect.assertions(9);
  });
});
