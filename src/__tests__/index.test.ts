import EventEmitter from '../';

enum Event {
  Pre = 'pre',
  Post = 'post',
}

describe('EventEmitter', () => {
  it('works', async done => {
    const ee = new EventEmitter<{ [Event.Pre]: { at: number }; [Event.Post]: { took: number } }>();

    const result: any = {};

    const firstOffPre = ee.on(Event.Pre, ({ at }) => {
      result.first = at;
    });

    const secondOffPre = ee.on(Event.Pre, ({ at }) => {
      result.second = 2 * at;
    });

    const offPost = ee.on(Event.Post, async ({ took }) => {
      result.took = took;
    });

    expect(result).toEqual({});

    await ee.emit(Event.Pre, { at: 2000 });

    expect(result).toEqual({
      first: 2000,
      second: 4000,
    });

    await ee.emit(Event.Post, { took: 100 });

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

    await ee.emit(Event.Pre, { at: 10000 });

    expect(ee.getEventNames()).toEqual([]);

    expect(result).toEqual({
      first: 2000,
      second: 4000,
      took: 100,
    });

    done();
  });

  it('addConfig works', async done => {
    const ee = new EventEmitter<{ [Event.Pre]: { at: number }; [Event.Post]: { took: number } }>();

    const result: any = {};

    const offs = ee.onConfig({
      // Several listeners for this event
      [Event.Pre]: [
        ({ at }) => {
          result.firstPreCall = at;
        },
        ({ at }) => {
          result.secondPreCall = at;
        },
      ],

      // Only one here
      [Event.Post]: ({ took }) => {
        result.firstPostCall = took;
      },
    });

    expect(ee.getEventNames()).toEqual(['pre', 'post']);

    await Promise.all([ee.emit(Event.Pre, { at: 10 }), ee.emit(Event.Post, { took: 100 })]);

    expect(result).toEqual({
      firstPostCall: 100,
      firstPreCall: 10,
      secondPreCall: 10,
    });

    offs.forEach(off => off());

    expect(ee.getEventNames()).toEqual([]);

    done();
  });

  it('works without typing', async done => {
    const ee = new EventEmitter();

    ee.on('notdDefinedEventName', () => {});

    await ee.emit('alsoNotdDefinedEventName', {});

    done();
  });

  it('once works', async done => {
    const ee = new EventEmitter<{ [Event.Pre]: {} }>();

    let count: number = 0;

    ee.once(Event.Pre, () => {
      count++;
    });

    ee.once(Event.Pre, () => {
      count++;
    });

    expect(count).toEqual(0);
    expect(ee.getEventNames()).toEqual(['pre']);

    await ee.emit(Event.Pre, {});

    expect(count).toEqual(2);
    expect(ee.getEventNames()).toEqual([]);

    await ee.emit(Event.Pre, {});

    expect(count).toEqual(2);
    expect(ee.getEventNames()).toEqual([]);

    done();
  });

  it('wait works', async done => {
    const ee = new EventEmitter<{ [Event.Pre]: {} }>();

    await expect(ee.wait(Event.Pre, 100)).rejects.toMatchInlineSnapshot(
      `"Has waited for the \\"pre\\" event more than 100ms"`,
    );

    expect(ee.getEventNames()).toEqual([]);

    const wait = ee.wait(Event.Pre, 100);

    expect(ee.getEventNames()).toEqual(['pre']);

    const [waited] = await Promise.all([wait, ee.emit(Event.Pre, { test: 'wait' })]);

    expect(waited).toEqual({
      test: 'wait',
    });

    expect(ee.getEventNames()).toEqual([]);

    done();
  });
});
