import assert from 'node:assert';
import { describe, it } from 'node:test';
import { AsyncEventEmitter, errorMonitor } from './index.js';

describe('EventEmitter', () => {
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

    assert.deepEqual(result, {});

    await ee.emit(EventName.Pre, { at: 2000 });

    assert.deepEqual(result, {
      first: 2000,
      second: 4000,
    });

    await ee.emit(EventName.Post, { took: 100 });

    assert.deepEqual(result, {
      first: 2000,
      second: 4000,
      took: 100,
    });

    assert.deepEqual(ee.eventNames(), ['pre', 'post']);

    firstOffPre();

    assert.deepEqual(ee.eventNames(), ['pre', 'post']);

    offPost();

    assert.deepEqual(ee.eventNames(), ['pre']);

    secondOffPre();

    assert.deepEqual(ee.eventNames(), []);

    await ee.emit(EventName.Pre, { at: 10000 });

    assert.deepEqual(ee.eventNames(), []);

    assert.deepEqual(result, {
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

    assert.deepEqual(ee.eventNames(), [
      NumericEventName.Pre,
      NumericEventName.Post,
    ]);

    firstOffPre();
    assert.deepEqual(ee.eventNames(), [
      NumericEventName.Pre,
      NumericEventName.Post,
    ]);

    offPost();
    assert.deepEqual(ee.eventNames(), [NumericEventName.Pre]);

    secondOffPre();
    assert.deepEqual(ee.eventNames(), []);
  });

  it('works with symbol event names', () => {
    const ee = new AsyncEventEmitter<SymbolEventMap>();

    const firstOffPre = ee.on(pre, () => {});
    const secondOffPre = ee.on(pre, () => {});
    const offPost = ee.on(post, async () => {});

    assert.deepEqual(ee.eventNames(), [pre, post]);

    firstOffPre();
    assert.deepEqual(ee.eventNames(), [pre, post]);

    offPost();
    assert.deepEqual(ee.eventNames(), [pre]);

    secondOffPre();
    assert.deepEqual(ee.eventNames(), []);
  });

  it('on "config" works with string event names', () => {
    const ee = new AsyncEventEmitter<EventMap>();

    const off = ee.on({
      // Several listeners for this event
      [EventName.Pre]: [() => {}, () => {}],
      // Only one here
      [EventName.Post]: () => {},

      error: (error) => {},
    });

    assert.deepEqual(ee.eventNames(), [EventName.Pre, EventName.Post, 'error']);

    off();
    assert.deepEqual(ee.eventNames(), []);
  });

  it('on "config" works with symbol event names', () => {
    const ee = new AsyncEventEmitter<SymbolEventMap>();

    const off = ee.on({
      // Several listeners for this event
      [pre]: [() => {}, () => {}],
      // Only one here
      [post]: () => {},
      // Only one for the errorMonitor
      [errorMonitor]: () => {},
    });

    assert.deepEqual(ee.eventNames(), [pre, post, errorMonitor]);

    off();
    assert.deepEqual(ee.eventNames(), []);
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

    assert.equal(count, 0);
    assert.deepEqual(ee.eventNames(), ['pre']);

    await ee.emit(EventName.Pre, {});

    assert.equal(count, 2);
    assert.deepEqual(ee.eventNames(), []);

    await ee.emit(EventName.Pre, {});

    assert.equal(count, 2);
    assert.deepEqual(ee.eventNames(), []);
  });

  it('wait works', async () => {
    const ee = new AsyncEventEmitter<{ [EventName.Pre]: {} }>();

    await assert.rejects(() => ee.wait(EventName.Pre, 50), {
      message: `The wait of the "pre" event has been aborted`,
    });

    assert.deepEqual(ee.eventNames(), []);

    const wait = ee.wait(EventName.Pre, 50);

    assert.deepEqual(ee.eventNames(), ['pre']);

    const [waited] = await Promise.all([
      wait,
      ee.emit(EventName.Pre, { test: 'wait' }),
    ]);

    assert.deepEqual(waited, { test: 'wait' });

    {
      const ac = new AbortController();
      ac.abort();

      await assert.rejects(() => ee.wait(EventName.Pre, ac.signal), {
        message: `This operation was aborted`,
      });
    }

    {
      const ac = new AbortController();

      await assert.rejects(
        () => Promise.all([ee.wait(EventName.Pre, ac.signal), ac.abort()]),
        { message: `The wait of the "pre" event has been aborted` },
      );
    }

    assert.deepEqual(ee.eventNames(), []);
  });

  it('throw on error', async () => {
    const ee = new AsyncEventEmitter<{ [EventName.Pre]: {} }>();

    await assert.rejects(
      () => Promise.all([ee.throwOnError(), ee.emit('error', new Error('KO'))]),
      { message: `KO` },
    );

    // handles signal
    {
      const ac = new AbortController();

      assert.deepEqual(
        await Promise.all([ee.throwOnError(ac.signal), (() => ac.abort())()]),
        [undefined, undefined],
      );
    }

    assert.deepEqual(ee.eventNames(), []);
  });

  it('race works', async () => {
    const ee = new AsyncEventEmitter<{
      [EventName.Pre]: {};
      [EventName.Post]: {};
    }>();

    await assert.rejects(() => ee.race([EventName.Pre, EventName.Post], 50), {
      message: `The wait of the "pre, post" events has been aborted`,
    });

    assert.deepEqual(ee.eventNames(), []);

    const race = ee.race([EventName.Pre, EventName.Post], 50);

    assert.deepEqual(ee.eventNames(), ['pre', 'post']);

    const [raced] = await Promise.all([
      race,
      ee.emit(EventName.Post, { took: 123 }),
    ]);

    assert.deepEqual(raced, { took: 123 });

    {
      const ac = new AbortController();
      ac.abort();

      await assert.rejects(
        () => ee.race([EventName.Pre, EventName.Post], ac.signal),
        { message: `This operation was aborted` },
      );
    }

    {
      const ac = new AbortController();

      await assert.rejects(
        () =>
          Promise.all([
            ee.race([EventName.Pre, EventName.Post], ac.signal),
            ac.abort(),
          ]),
        { message: `The wait of the "pre, post" events has been aborted` },
      );
    }

    assert.deepEqual(ee.eventNames(), []);
  });

  it('handle errors properly', async () => {
    const config = {
      myEventName: () => {
        throw new Error('An error');
      },
    };

    const eventEmitterWithoutErrorListener = new AsyncEventEmitter(config);

    await assert.rejects(
      () => eventEmitterWithoutErrorListener.emit('myEventName', null),
      { message: `An error` },
    );

    await assert.rejects(
      () =>
        eventEmitterWithoutErrorListener.emit(
          'error',
          new Error('External error'),
        ),
      { message: `External error` },
    );

    const eventEmitterWithErrorMonitorListener = new AsyncEventEmitter({
      ...config,

      [errorMonitor]: (error) => {
        assert(error instanceof Error);
        assert.equal(error.message, 'An error');
      },
    });

    await assert.rejects(
      () => eventEmitterWithErrorMonitorListener.emit('myEventName', null),
      { message: `An error` },
    );

    const eventEmitterWithErrorListener = new AsyncEventEmitter({
      ...config,

      [errorMonitor]: (error) => {
        assert(error instanceof Error);
        assert.equal(error.message, 'An error');
      },

      error: (error) => {
        assert(error instanceof Error);
        assert.equal(error.message, 'An error');
      },
    });

    assert.equal(
      await eventEmitterWithErrorListener.emit('myEventName', null),
      undefined,
    );

    assert.equal(
      await eventEmitterWithErrorListener.emit('error', new Error('An error')),
      undefined,
    );
  });
});
