**Typescript async event emitter**

[![npm version](https://badge.fury.io/js/%40prismamedia%2Fts-async-event-emitter.svg)](https://badge.fury.io/js/%40prismamedia%2Fts-async-event-emitter) [![CircleCI](https://circleci.com/gh/prismamedia/ts-async-event-emitter/tree/master.svg?style=svg)](https://circleci.com/gh/prismamedia/ts-async-event-emitter/tree/master)

Inspired by https://github.com/sindresorhus/emittery#typescript, without the legacy part

## Usage

```js
import EventEmitter from '@prismamedia/ts-async-event-emitter';

enum Event {
  Pre = 'pre',
  Post = 'post',
}

const ee = new EventEmitter<{ [Event.Pre]: { at: number }; [Event.Post]: { took: number } }>();

// "offPre" is a convenient method to unregister the listener later, see below
const offPre = ee.on(Event.Pre, ({ at }) => console.log({ at }));

const offPost = ee.on(Event.Post, async ({ took }) => console.log({ took }));

// [...]

await ee.emit(Event.Pre, { at: 2000 });
// -> { at: 2000 }

await ee.emit(Event.Post, { took: 100 });
// -> { took: 100 }

// Unregister the listener
offPre();

// Won't log anything
await ee.emit(Event.Pre, { at: 2000 });
// ->
```
