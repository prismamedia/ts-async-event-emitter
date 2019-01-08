import EventEmitter from '../';

enum Event {
  Pre = 'pre',
  Post = 'post',
}

describe('EventEmitter', () => {
  it('works', async done => {
    const ee = new EventEmitter<{ [Event.Pre]: { at: number }; [Event.Post]: { took: number } }>();

    const result: any = {};

    const offPre = ee.on(Event.Pre, ({ at }) => {
      result.at = at;
    });

    const offPost = ee.on(Event.Post, async ({ took }) => {
      result.took = took;
    });

    expect(result).toEqual({});

    const preEventData = { at: 2000 };

    await ee.emit(Event.Pre, preEventData);

    expect(result).toEqual({ at: 2000 });

    const postEventData = { took: 100 };

    await ee.emit(Event.Post, postEventData);

    expect(result).toEqual({ at: 2000, took: 100 });

    expect(ee.getEventNames()).toEqual([Event.Pre, Event.Post]);

    offPre();

    expect(ee.getEventNames()).toEqual([Event.Post]);

    offPost();

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

    expect(ee.getEventNames()).toEqual([Event.Pre]);

    await ee.emit(Event.Pre, {});

    expect(count).toBe(1);
    expect(ee.getEventNames()).toEqual([]);

    await ee.emit(Event.Pre, {});

    expect(count).toBe(1);
    expect(ee.getEventNames()).toEqual([]);

    done();
  });

  it('wait works', async done => {
    const ee = new EventEmitter<{ [Event.Pre]: {} }>();

    await expect(ee.wait(Event.Pre, 100)).rejects.toMatch('Has waited for "pre" more than 100ms');

    expect(ee.getEventNames()).toEqual([]);

    const wait = ee.wait(Event.Pre, 100);

    expect(ee.getEventNames()).toEqual([Event.Pre]);

    await Promise.all([wait, ee.emit(Event.Pre, { test: 'wait' })]);

    expect(ee.getEventNames()).toEqual([]);

    done();
  });
});
