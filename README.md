**Async-event-emitter**

[![npm version](https://badge.fury.io/js/%40prismamedia%2Fasync-event-emitter.svg)](https://badge.fury.io/js/%40prismamedia%2Fasync-event-emitter) [![github actions status](https://github.com/prismamedia/async-event-emitter/workflows/CI/badge.svg)](https://github.com/prismamedia/ts-async-event-emitter/actions) [![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

Heavily inspired by https://github.com/sindresorhus/emittery#typescript, without the legacy part

# Usage

```js
import { AsyncEventEmitter } from '@prismamedia/async-event-emitter';

// We use an "Enum" to name the events
enum EventKind {
  Pre = 'pre',
  Post = 'post',
}

// We "type" the data carried by the events like this :
const ee = new AsyncEventEmitter<{ [EventKind.Pre]: { at: number }; [EventKind.Post]: { took: number } }>();

// We can listen on events like this :
// "offFirstPre" is a convenient method to unregister the listener later, see below
const offFirstPre = ee.on(EventKind.Pre, ({ at }) => console.log({ first: at }));
ee.on(EventKind.Pre, ({ at }) => console.log({ second: at * 2 }));
ee.on(EventKind.Post, async ({ took }) => console.log({ took }));

// [...]

await ee.emit(EventKind.Pre, { at: 2000 });
// -> { any: 2000 }
// -> { first: 2000 }
// -> { second: 4000 }

await ee.emit(EventKind.Post, { took: 100 });
// -> { any: 100 }
// -> { took: 100 }

// Unregister the first listener
offFirstPre();

// Only the second listener remains
await ee.emit(EventKind.Pre, { at: 10000 });
// -> { any: 10000 }
// -> { second: 20000 }
```

## Other convenient methods are available :

### on "config"

```js
// Subscribe to a bunch of events
ee.on({
  // Several listeners for this event
  [EventKind.Pre]: [
    () => console.log({ at }),
    () => console.log({ at: at * 2 }),
  ],
  // Only one here
  [EventKind.Post]: () => console.log({ took }),
});
```

_Be aware that the on "config" method does not support "numeric" event kinds, as javascript transforms the "numeric" keys into "string"_

### once

```js
// Subscribe to an event for only one execution
ee.once(EventKind.Pre, ({ at }) => console.log({ at }));
```

### wait

```js
// Wait for an event to be triggered
const eventData = await ee.wait(EventKind.Pre);

// Wait for an event to be triggered with a 100ms timeout (if the "timeout" is reached before the event has been triggered an Error will be thrown)
const eventData = await ee.wait(EventKind.Pre, 100);
```
