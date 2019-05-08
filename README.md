**Typescript async event emitter**

[![npm version](https://badge.fury.io/js/%40prismamedia%2Fts-async-event-emitter.svg)](https://badge.fury.io/js/%40prismamedia%2Fts-async-event-emitter) [![CircleCI](https://circleci.com/gh/prismamedia/ts-async-event-emitter/tree/master.svg?style=svg)](https://circleci.com/gh/prismamedia/ts-async-event-emitter/tree/master)

Heavily inspired by https://github.com/sindresorhus/emittery#typescript, without the legacy part

# Usage

```js
import EventEmitter from '@prismamedia/ts-async-event-emitter';

// We use an "Enum" to name the events
enum Event {
  Pre = 'pre',
  Post = 'post',
}

// We "type" the data carried by the events like this :
const ee = new EventEmitter<{ [Event.Pre]: { at: number }; [Event.Post]: { took: number } }>();

// We can listen on events like this :
// "offFirstPre" is a convenient method to unregister the listener later, see below
const offFirstPre = ee.on(Event.Pre, ({ at }) => console.log({ first: at }));
ee.on(Event.Pre, ({ at }) => console.log({ second: at * 2 }));
ee.on(Event.Post, async ({ took }) => console.log({ took }));

// [...]

await ee.emit(Event.Pre, { at: 2000 });
// -> { any: 2000 }
// -> { first: 2000 }
// -> { second: 4000 }

await ee.emit(Event.Post, { took: 100 });
// -> { any: 100 }
// -> { took: 100 }

// Unregister the first listener
offFirstPre();

// Only the second listener remains
await ee.emit(Event.Pre, { at: 10000 });
// -> { any: 10000 }
// -> { second: 20000 }
```

## Other convenient methods are available :

### onConfig

```js
// Subscribe to a bunch of events
ee.onConfig({
  // Several listeners for this event
  [Event.Pre]: [() => console.log({ at }), () => console.log({ at: at * 2 })],
  // Only one here
  [Event.Post]: () => console.log({ took }),
});
```

### once

```js
// Subscribe to an event for only one execution
ee.once(Event.Pre, ({ at }) => console.log({ at }));
```

### wait

```js
// Wait for an event to be triggered
const eventData = await ee.wait(Event.Pre);

// Wait for an event to be triggered with a 100ms timeout (if the "timeout" is reached before the event has been triggered an Error will be thrown)
const eventData = await ee.wait(Event.Pre, 100);
```
