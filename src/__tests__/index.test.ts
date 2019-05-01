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

    expect(result).toMatchInlineSnapshot(`Object {}`);

    await ee.emit(Event.Pre, { at: 2000 });

    expect(result).toMatchInlineSnapshot(`
Object {
  "first": 2000,
  "second": 4000,
}
`);

    await ee.emit(Event.Post, { took: 100 });

    expect(result).toMatchInlineSnapshot(`
Object {
  "first": 2000,
  "second": 4000,
  "took": 100,
}
`);

    expect(ee.getEventNames()).toMatchInlineSnapshot(`
Array [
  "pre",
  "post",
]
`);

    firstOffPre();

    expect(ee.getEventNames()).toMatchInlineSnapshot(`
Array [
  "pre",
  "post",
]
`);

    offPost();

    expect(ee.getEventNames()).toMatchInlineSnapshot(`
Array [
  "pre",
]
`);

    secondOffPre();

    expect(ee.getEventNames()).toMatchInlineSnapshot(`Array []`);

    await ee.emit(Event.Pre, { at: 10000 });

    expect(ee.getEventNames()).toMatchInlineSnapshot(`Array []`);

    expect(result).toMatchInlineSnapshot(`
Object {
  "first": 2000,
  "second": 4000,
  "took": 100,
}
`);

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

    expect(ee.getEventNames()).toMatchInlineSnapshot(`
Array [
  "pre",
]
`);

    await ee.emit(Event.Pre, {});

    expect(count).toMatchInlineSnapshot(`2`);
    expect(ee.getEventNames()).toMatchInlineSnapshot(`Array []`);

    await ee.emit(Event.Pre, {});

    expect(count).toMatchInlineSnapshot(`2`);
    expect(ee.getEventNames()).toMatchInlineSnapshot(`Array []`);

    done();
  });

  it('wait works', async done => {
    const ee = new EventEmitter<{ [Event.Pre]: {} }>();

    await expect(ee.wait(Event.Pre, 100)).rejects.toMatchInlineSnapshot(
      `"Has waited for the \\"pre\\" event more than 100ms"`,
    );

    expect(ee.getEventNames()).toMatchInlineSnapshot(`Array []`);

    const wait = ee.wait(Event.Pre, 100);

    expect(ee.getEventNames()).toMatchInlineSnapshot(`
Array [
  "pre",
]
`);

    const [waited] = await Promise.all([wait, ee.emit(Event.Pre, { test: 'wait' })]);

    expect(waited).toMatchInlineSnapshot(`
Object {
  "test": "wait",
}
`);
    expect(ee.getEventNames()).toMatchInlineSnapshot(`Array []`);

    done();
  });
});
