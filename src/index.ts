import { errorMonitor } from 'node:events';
import { inspect } from 'node:util';
import type { Promisable } from 'type-fest';
import { AbortError } from './error.js';

export * from './error.js';
export { errorMonitor };

type Maybe<T> = undefined | null | T;
type ValueOrArray<T> = T | Array<T>;

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
> = (eventData: EventData<TDataByName, TName>) => Promisable<void>;

const unsubscribeFromSignalAbortEvent = Symbol(
  "unsubscribe from signal's abort event",
);

type WrappedEventListener<
  TDataByName extends EventDataByName,
  TName extends EventName<TDataByName>,
> = EventListener<TDataByName, TName> & {
  [unsubscribeFromSignalAbortEvent]?: () => void;
};

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
        listener[unsubscribeFromSignalAbortEvent]?.();

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
  ): BoundOff;

  /**
   * Subscribe to a bunch of events.
   * Returns an array of unsubscribe methods
   */
  public on(
    configByName: EventConfigByName<TDataByName>,
    signal?: AbortSignal | number | null,
  ): BoundOff;

  public on<TName extends EventName<TDataByName>>(
    ...args:
      | [
          eventName: TName,
          listener: EventListener<TDataByName, TName>,
          signal?: AbortSignal | number | null,
        ]
      | [
          configByName: EventConfigByName<TDataByName>,
          signal?: AbortSignal | number | null,
        ]
  ): BoundOff {
    if (typeof args[0] === 'object' && args[0] != null) {
      const [configByName, maybeSignal] = args as [
        EventConfigByName<TDataByName>,
        AbortSignal | number | null | undefined,
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
              offs.push(this.on(eventName, listener, signal));
            }
          }
        }
      }

      return () => offs.forEach((off) => off());
    }

    const [eventName, listener, maybeSignal] = args as [
      TName,
      EventListener<TDataByName, TName>,
      AbortSignal | number | null | undefined,
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

    const off: BoundOff = () => this.off(eventName, wrappedListener);

    const wrappedListener: WrappedEventListener<TDataByName, TName> =
      eventName === 'error' || eventName === errorMonitor
        ? listener
        : async (eventData) => {
            try {
              await listener(eventData);
            } catch (error) {
              // cf: https://nodejs.org/api/events.html#events_error_events
              await this.emit(errorMonitor, error);

              if (this.#listenersByName.get('error')?.size) {
                await this.emit('error', error);
              } else {
                throw error;
              }
            }
          };

    const signal =
      typeof maybeSignal === 'number'
        ? AbortSignal.timeout(maybeSignal)
        : maybeSignal || undefined;

    if (signal) {
      signal.throwIfAborted();
      signal.addEventListener('abort', off, { once: true });
      Object.assign(wrappedListener, {
        [unsubscribeFromSignalAbortEvent]: () =>
          signal.removeEventListener('abort', off),
      });
    }

    listeners.add(wrappedListener);

    return off;
  }

  /**
   * Subscribe to an event only once.
   * It will be unsubscribed after the first execution.
   */
  public once<TName extends EventName<TDataByName>>(
    eventName: TName,
    listener: EventListener<TDataByName, TName>,
    signal?: AbortSignal | number | null,
  ): BoundOff {
    const off = this.on(
      eventName,
      async (eventData) => {
        off();

        await listener(eventData);
      },
      signal,
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
      const onAbort = () => {
        off();

        reject(
          new AbortError(
            `The wait of the "${String(eventName)}" event has been aborted`,
            { cause: signal?.reason },
          ),
        );
      };

      signal?.addEventListener('abort', onAbort, { once: true });

      const off = this.on(eventName, (eventData) => {
        off();
        signal?.removeEventListener('abort', onAbort);

        resolve(eventData);
      });
    });
  }

  public async throwOnError(
    maybeSignal?: AbortSignal | number | null,
  ): Promise<void> {
    const signal =
      typeof maybeSignal === 'number'
        ? AbortSignal.timeout(maybeSignal)
        : maybeSignal || undefined;

    signal?.throwIfAborted();

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
      const onAbort = () => {
        offs.forEach((off) => off());

        reject(
          new AbortError(
            `The wait of the "${eventNames
              .map(String)
              .join(', ')}" events has been aborted`,
            { cause: signal?.reason },
          ),
        );
      };

      signal?.addEventListener('abort', onAbort, { once: true });

      const offs = eventNames.map((eventName) =>
        this.on(eventName, (eventData) => {
          offs.forEach((off) => off());
          signal?.removeEventListener('abort', onAbort);

          resolve(eventData);
        }),
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
    const listeners = this.#listenersByName.get(eventName);
    if (listeners?.size) {
      await Promise.all(
        Array.from(listeners, (listener) => listener(eventData)),
      );
    }
  }
}
