import { errorMonitor } from 'node:events';
import { clearInterval, setInterval } from 'node:timers';
import { inspect } from 'node:util';
import type { Promisable } from 'type-fest';
import { AbortError } from './error.js';

export * from './error.js';
export { errorMonitor };

type Maybe<T> = undefined | null | T;
type ValueOrArray<T> = T | Array<T>;
type OnAbort = (event: Event) => void;

export type EventDataByName = Record<keyof any, any>;

/**
 * cf: https://nodejs.org/api/events.html#events_error_events
 */
export type ErrorEventDataByName = {
  error: any;
  [errorMonitor]: any;
};

export type EventName<TDataByName extends EventDataByName> =
  keyof (TDataByName & ErrorEventDataByName);

export type EventData<
  TDataByName extends EventDataByName,
  TName extends EventName<TDataByName>,
> = (TDataByName & ErrorEventDataByName)[TName];

export type EventListener<
  TDataByName extends EventDataByName,
  TName extends EventName<TDataByName>,
> = (eventData: EventData<TDataByName, TName>) => Promisable<any>;

const preOffHook = Symbol('Pre-Off hook');

type WrappedEventListener<
  TDataByName extends EventDataByName,
  TName extends EventName<TDataByName>,
> = EventListener<TDataByName, TName> & { [preOffHook]?: () => void };

export type EventConfig<
  TDataByName extends EventDataByName,
  TName extends EventName<TDataByName>,
> = ValueOrArray<Maybe<EventListener<TDataByName, TName>>>;

type EventNameExcludingNumber<TDataByName extends EventDataByName> = Exclude<
  EventName<TDataByName>,
  number
>;

export type EventConfigByName<TDataByName extends EventDataByName> = {
  // Forbid usage of "numeric" key because javascript does not support it: they are transform into "string"
  [TName in EventNameExcludingNumber<TDataByName>]?: EventConfig<
    TDataByName,
    TName
  >;
};

export type BoundOff = () => void;

export class AsyncEventEmitter<TDataByName extends EventDataByName = any> {
  readonly #listenersByName = new Map<
    EventName<TDataByName>,
    Set<WrappedEventListener<TDataByName, any>>
  >();

  public constructor(config?: EventConfigByName<TDataByName> | null) {
    config && this.on(config);
  }

  /**
   * Unsubscribe either :
   * - one listener for a given event-name
   * - all listeners for a given event-name
   * - all listeners
   */
  public off<TName extends EventName<TDataByName>>(
    eventName?: TName,
    listener?: WrappedEventListener<TDataByName, TName>,
  ): void {
    if (eventName != null) {
      if (listener) {
        listener[preOffHook]?.();

        const listeners = this.#listenersByName.get(eventName);
        if (listeners?.delete(listener) && !listeners.size) {
          this.#listenersByName.delete(eventName);
        }
      } else {
        this.#listenersByName
          .get(eventName)
          ?.forEach((listener) => this.off(eventName, listener));
      }
    } else {
      this.#listenersByName.forEach((listeners, eventName) =>
        listeners.forEach((listener) => this.off(eventName, listener)),
      );
    }
  }

  /**
   * Subscribe to an event.
   * Returns a method to unsubscribe later.
   */
  public on<TName extends EventName<TDataByName>>(
    eventName: TName,
    listener: EventListener<TDataByName, TName>,
    signal?: AbortSignal | number | null,
    onAbort?: OnAbort,
  ): BoundOff & Disposable;

  /**
   * Subscribe to a bunch of events.
   * Returns an array of unsubscribe methods
   */
  public on(
    configByName: EventConfigByName<TDataByName>,
    signal?: AbortSignal | number | null,
    onAbort?: OnAbort,
  ): BoundOff & Disposable;

  public on<TName extends EventName<TDataByName>>(
    ...args:
      | [
          eventName: TName,
          listener: EventListener<TDataByName, TName>,
          signal?: AbortSignal | number | null,
          onAbort?: OnAbort,
        ]
      | [
          configByName: EventConfigByName<TDataByName>,
          signal?: AbortSignal | number | null,
          onAbort?: OnAbort,
        ]
  ): BoundOff & Disposable {
    if (typeof args[0] === 'object' && args[0] != null) {
      const [configByName, maybeSignal, maybeOnAbort] = args as [
        configByName: EventConfigByName<TDataByName>,
        maybeSignal?: AbortSignal | number | null,
        maybeOnAbort?: OnAbort,
      ];

      const signal =
        typeof maybeSignal === 'number'
          ? AbortSignal.timeout(maybeSignal)
          : maybeSignal || undefined;

      const offs: BoundOff[] = [];

      for (const eventName of [
        ...Object.getOwnPropertyNames(configByName),
        ...Object.getOwnPropertySymbols(configByName),
      ] as EventNameExcludingNumber<TDataByName>[]) {
        const configs = configByName[eventName];
        if (configs != null) {
          const listeners = Array.isArray(configs) ? configs : [configs];
          for (const listener of listeners) {
            if (listener != null) {
              offs.push(this.on(eventName, listener, signal, maybeOnAbort));
            }
          }
        }
      }

      const off = () => offs.forEach((off) => off());

      return Object.assign(off, { [Symbol.dispose]: off });
    }

    const [eventName, listener, maybeSignal, maybeOnAbort] = args as [
      eventName: TName,
      listener: EventListener<TDataByName, TName>,
      maybeSignal?: AbortSignal | number | null,
      maybeOnAbort?: OnAbort,
    ];

    if (!['number', 'string', 'symbol'].includes(typeof eventName)) {
      throw new TypeError(
        `Expects to be a number, a string or a symbol, got: ${inspect(
          eventName,
        )}`,
      );
    }

    if (typeof listener !== 'function') {
      throw new TypeError(`Expects a function, got: ${inspect(listener)}`);
    }

    let listeners = this.#listenersByName.get(eventName);
    if (!listeners) {
      this.#listenersByName.set(eventName, (listeners = new Set()));
    }

    const wrappedListener: WrappedEventListener<TDataByName, TName> =
      eventName === errorMonitor || eventName === 'error'
        ? listener
        : (eventData) =>
            new Promise((resolve) => resolve(listener(eventData))).catch(
              (error) => this.emit('error', error),
            );

    const off: BoundOff = () => this.off(eventName, wrappedListener);

    const signal =
      typeof maybeSignal === 'number'
        ? AbortSignal.timeout(maybeSignal)
        : maybeSignal || undefined;

    if (signal) {
      signal.throwIfAborted();

      const onAbort = maybeOnAbort
        ? (event: Event) => {
            try {
              maybeOnAbort(event);
            } finally {
              off();
            }
          }
        : off;

      signal.addEventListener('abort', onAbort, { once: true });

      Object.assign(wrappedListener, {
        [preOffHook]: () => signal.removeEventListener('abort', onAbort),
      });
    }

    listeners.add(wrappedListener);

    return Object.assign(off, { [Symbol.dispose]: off });
  }

  /**
   * Subscribe to an event only once.
   * It will be unsubscribed after the first execution.
   */
  public once<TName extends EventName<TDataByName>>(
    eventName: TName,
    listener: EventListener<TDataByName, TName>,
    signal?: AbortSignal | number | null,
    onAbort?: OnAbort,
  ): BoundOff & Disposable {
    const off = this.on(
      eventName,
      (eventData) => {
        off();

        return listener(eventData);
      },
      signal,
      onAbort,
    );

    return off;
  }

  public async wait<TName extends EventName<TDataByName>>(
    eventName: TName,
    maybeSignal?: AbortSignal | number | null,
  ): Promise<EventData<TDataByName, TName>> {
    const signal =
      typeof maybeSignal === 'number'
        ? AbortSignal.timeout(maybeSignal)
        : maybeSignal || undefined;

    signal?.throwIfAborted();

    return new Promise((resolve, reject) => {
      // To avoid the error: 'Promise resolution is still pending but the event loop has already resolved'
      const keepalive = setInterval(() => {}, 1_000);

      this.once(
        eventName,
        (eventData) => {
          clearInterval(keepalive);
          resolve(eventData);
        },
        signal,
        () => {
          clearInterval(keepalive);
          reject(
            new AbortError(
              `The wait of the "${String(eventName)}" event has been aborted`,
              signal?.reason && { cause: signal.reason },
            ),
          );
        },
      );
    });
  }

  public async throwOnError(
    signal?: AbortSignal | number | null,
  ): Promise<void> {
    let error: any;

    try {
      error = await this.wait('error', signal);
    } catch (error) {
      if (error instanceof AbortError) {
        return;
      }

      throw error;
    }

    throw error;
  }

  public async race<TName extends EventName<TDataByName>>(
    eventNames: ReadonlyArray<TName>,
    maybeSignal?: AbortSignal | number | null,
  ): Promise<EventData<TDataByName, TName>> {
    if (eventNames.length === 1) {
      return this.wait(eventNames[0], maybeSignal);
    }

    const signal =
      typeof maybeSignal === 'number'
        ? AbortSignal.timeout(maybeSignal)
        : maybeSignal || undefined;

    signal?.throwIfAborted();

    return new Promise((resolve, reject) => {
      // To avoid the error: 'Promise resolution is still pending but the event loop has already resolved'
      const keepalive = setInterval(() => {}, 1_000);

      const off = this.on(
        Object.fromEntries(
          eventNames.map((eventName) => [
            eventName,
            (eventData) => {
              off();
              clearInterval(keepalive);
              resolve(eventData);
            },
          ]),
        ) as EventConfigByName<any>,
        signal,
        () => {
          clearInterval(keepalive);
          reject(
            new AbortError(
              `The wait of the "${eventNames
                .map(String)
                .join(', ')}" events has been aborted`,
              signal?.reason && { cause: signal.reason },
            ),
          );
        },
      );
    });
  }

  public eventNames(): Array<EventName<TDataByName>> {
    return Array.from(this.#listenersByName.keys());
  }

  public eventListeners<TName extends EventName<TDataByName>>(
    eventName: TName,
  ): Array<EventListener<TDataByName, TName>> {
    const listeners = this.#listenersByName.get(eventName);

    return listeners?.size ? Array.from(listeners) : [];
  }

  public eventListenerCount(eventName: EventName<TDataByName>): number {
    return this.#listenersByName.get(eventName)?.size ?? 0;
  }

  /**
   * Trigger an event asynchronously with some data. Listeners are called in the order they were added, but execute concurrently.
   * Returns a promise for when all the event listeners are done. Done meaning executed if synchronous or resolved when an async/promise-returning function. You usually wouldn't want to wait for this, but you could for example catch possible errors. If any of the listeners throw/reject, the returned promise will be rejected with the error, but the other listeners will not be affected.
   */
  public async emit<TName extends EventName<TDataByName>>(
    eventName: TName,
    eventData: EventData<TDataByName, TName>,
  ): Promise<void> {
    if (eventName === 'error') {
      await this.emit(errorMonitor, eventData);
    }

    const listeners = this.#listenersByName.get(eventName);
    if (listeners?.size) {
      await Promise.all(
        Array.from(listeners, (listener) => listener(eventData)),
      );
    } else if (eventName === 'error') {
      throw eventData;
    }
  }
}
