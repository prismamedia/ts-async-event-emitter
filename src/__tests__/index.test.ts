import { EventEmitter } from '../';

enum EventKind {
  Pre = 'pre',
  Post = 'post',
}

type EventMap = {
  [EventKind.Pre]: { at: number };
  [EventKind.Post]: { took: number };
};

enum NumericEventKind {
  Pre,
  Post,
}

type NumericEventMap = {
  [NumericEventKind.Pre]: { at: number };
  [NumericEventKind.Post]: { took: number };
};

const pre = Symbol('Pre');
const post = Symbol('Post');

type SymbolEventMap = {
  [pre]: { at: number };
  [post]: { took: number };
};

describe('EventEmitter', () => {
  it('works with string event names', async done => {
    const ee = new EventEmitter<EventMap>();

    const result: any = {};

    const firstOffPre = ee.on(EventKind.Pre, ({ at }) => {
      result.first = at;
    });

    const secondOffPre = ee.on(EventKind.Pre, ({ at }) => {
      result.second = 2 * at;
    });

    const offPost = ee.on(EventKind.Post, async ({ took }) => {
      result.took = took;
    });

    expect(result).toEqual({});

    await ee.emit(EventKind.Pre, { at: 2000 });

    expect(result).toEqual({
      first: 2000,
      second: 4000,
    });

    await ee.emit(EventKind.Post, { took: 100 });

    expect(result).toEqual({
      first: 2000,
      second: 4000,
      took: 100,
    });

    expect(ee.getEventNames()).toEqual(['pre', 'post']);

    firstOffPre();

    expect(ee.getEventNames()).toEqual(['pre', 'post']);

    offPost();

    expect(ee.getEventNames()).toEqual(['pre']);

    secondOffPre();

    expect(ee.getEventNames()).toEqual([]);

    await ee.emit(EventKind.Pre, { at: 10000 });

    expect(ee.getEventNames()).toEqual([]);

    expect(result).toEqual({
      first: 2000,
      second: 4000,
      took: 100,
    });

    done();
  });

  it('works with numeric event names', () => {
    const ee = new EventEmitter<NumericEventMap>();

    const firstOffPre = ee.on(NumericEventKind.Pre, () => {});
    const secondOffPre = ee.on(NumericEventKind.Pre, () => {});
    const offPost = ee.on(NumericEventKind.Post, async () => {});

    expect(ee.getEventNames()).toEqual([
      NumericEventKind.Pre,
      NumericEventKind.Post,
    ]);

    firstOffPre();
    expect(ee.getEventNames()).toEqual([
      NumericEventKind.Pre,
      NumericEventKind.Post,
    ]);

    offPost();
    expect(ee.getEventNames()).toEqual([NumericEventKind.Pre]);

    secondOffPre();
    expect(ee.getEventNames()).toEqual([]);
  });

  it('works with symbol event names', () => {
    const ee = new EventEmitter<SymbolEventMap>();

    const firstOffPre = ee.on(pre, () => {});
    const secondOffPre = ee.on(pre, () => {});
    const offPost = ee.on(post, async () => {});

    expect(ee.getEventNames()).toEqual([pre, post]);

    firstOffPre();
    expect(ee.getEventNames()).toEqual([pre, post]);

    offPost();
    expect(ee.getEventNames()).toEqual([pre]);

    secondOffPre();
    expect(ee.getEventNames()).toEqual([]);
  });

  it('addConfig works with string event names', () => {
    const ee = new EventEmitter<EventMap>();

    const offs = ee.onConfig({
      // Several listeners for this event
      [EventKind.Pre]: [() => {}, () => {}],
      // Only one here
      [EventKind.Post]: () => {},
    });

    expect(ee.getEventNames()).toEqual([EventKind.Pre, EventKind.Post]);

    offs.forEach(off => off());
    expect(ee.getEventNames()).toEqual([]);
  });

  it('addConfig works with symbol event names', () => {
    const ee = new EventEmitter<SymbolEventMap>();

    const offs = ee.onConfig({
      // Several listeners for this event
      [pre]: [() => {}, () => {}],
      // Only one here
      [post]: () => {},
    });

    expect(ee.getEventNames()).toEqual([pre, post]);

    offs.forEach(off => off());
    expect(ee.getEventNames()).toEqual([]);
  });

  it('works without typing', async done => {
    const ee = new EventEmitter();

    ee.on('notdDefinedEventName', () => {});

    await ee.emit('alsoNotdDefinedEventName', {});

    done();
  });

  it('once works', async done => {
    const ee = new EventEmitter<{ [EventKind.Pre]: {} }>();

    let count: number = 0;

    ee.once(EventKind.Pre, () => {
      count++;
    });

    ee.once(EventKind.Pre, () => {
      count++;
    });

    expect(count).toEqual(0);
    expect(ee.getEventNames()).toEqual(['pre']);

    await ee.emit(EventKind.Pre, {});

    expect(count).toEqual(2);
    expect(ee.getEventNames()).toEqual([]);

    await ee.emit(EventKind.Pre, {});

    expect(count).toEqual(2);
    expect(ee.getEventNames()).toEqual([]);

    done();
  });

  it('wait works', async done => {
    const ee = new EventEmitter<{ [EventKind.Pre]: {} }>();

    await expect(ee.wait(EventKind.Pre, 100)).rejects.toMatchInlineSnapshot(
      `"Has waited for the \\"pre\\" event more than 100ms"`,
    );

    expect(ee.getEventNames()).toEqual([]);

    const wait = ee.wait(EventKind.Pre, 100);

    expect(ee.getEventNames()).toEqual(['pre']);

    const [waited] = await Promise.all([
      wait,
      ee.emit(EventKind.Pre, { test: 'wait' }),
    ]);

    expect(waited).toEqual({
      test: 'wait',
    });

    expect(ee.getEventNames()).toEqual([]);

    done();
  });
});
