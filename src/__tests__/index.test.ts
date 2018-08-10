import EventEmitter from '../';

describe('EventEmitter', () => {
  it('works', async done => {
    const ee = new EventEmitter<{ pre: { at: number }; post: { took: number } }>();

    const result: any = {};

    const offPre = ee.on('pre', ({ at }) => (result.at = at));
    const offPost = ee.on('post', async ({ took }) => (result.took = took));

    expect(result).toEqual({});

    const preEventData = { at: 2000 };

    await ee.emit('pre', preEventData);

    expect(result).toEqual({ at: 2000 });

    const postEventData = { took: 100 };

    await ee.emit('post', postEventData);

    expect(result).toEqual({ at: 2000, took: 100 });

    expect(ee.eventNames()).toEqual(['pre', 'post']);

    offPre();

    expect(ee.eventNames()).toEqual(['post']);

    offPost();

    expect(ee.eventNames()).toEqual([]);

    done();
  });

  it('once works', async done => {
    const ee = new EventEmitter<{ pre: {} }>();

    let count: number = 0;

    ee.once('pre', () => {
      count++;
    });

    await ee.emit('pre', {});

    expect(count).toBe(1);

    await ee.emit('pre', {});

    expect(count).toBe(1);

    expect(ee.eventNames()).toEqual(['pre']);

    done();
  });

  it('wait works', async done => {
    const ee = new EventEmitter<{ pre: {} }>();

    await expect(ee.wait('pre', 100)).rejects.toMatch('Has waited for "pre" more than 100ms');

    expect(ee.eventNames()).toEqual([]);

    const wait = ee.wait('pre', 100);

    expect(ee.eventNames()).toEqual(['pre']);

    await Promise.all([wait, ee.emit('pre', { test: 'wait' })]);

    expect(ee.eventNames()).toEqual([]);

    done();
  });
});
