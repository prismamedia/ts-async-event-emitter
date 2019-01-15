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

// We can listen on "named" events like this :
// "offFirstPre" is a convenient method to unregister the listener later, see below
const offFirstPre = ee.on(Event.Pre, ({ at }) => console.log({ first: at }));
ee.on(Event.Pre, ({ at }) => console.log({ second: at * 2 }));
ee.on(Event.Post, async ({ took }) => console.log({ took }));

// We can listen on "any" events like this :
ee.on((eventName, eventData) => {
  // In order to have a proper typing of "eventData", we can use the "isEvent" type guard.
  if (ee.isEvent(Event.Pre, eventName, eventData)) {
    // Here the "eventData" has a "at" property.
    console.log({ any: eventData.at })
  } else if (ee.isEvent(Event.Post, eventName, eventData)) {
    // Here the "eventData" has a "took" property.
    console.log({ any: eventData.took })
  }
});

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

// Only the second listener remains, and the "any" ones
await ee.emit(Event.Pre, { at: 10000 });
// -> { any: 10000 }
// -> { second: 20000 }
```

## Other convenient methods are available :

### once

```js
// Subscribe to a "named" event for only one execution
ee.once(Event.Pre, ({ at }) => console.log({ at }));

// Subscribe to any event for only one execution
ee.once((eventName, eventData) => console.log({ eventName, eventData }));
```

### wait

```js
// Wait for a "named" event to be triggered
const eventData = await ee.wait(Event.Pre);

// Wait for a "named" event to be triggered with a 100ms timeout (if the "timeout" is reached before the "named" event has been triggered an Error will be thrown)
const eventData = await ee.wait(Event.Pre, 100);

// Wait for any event to be triggered
const eventData = await ee.wait();

// Wait for any event to be triggered with a 100ms timeout (if the "timeout" is reached before any event has been triggered an Error will be thrown)
const eventData = await ee.wait(100);
```
