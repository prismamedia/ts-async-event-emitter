import { errorMonitor } from 'node:events';
import { clearTimeout, setTimeout } from 'node:timers';
import { inspect } from 'node:util';
import type { Promisable } from 'type-fest';

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
    Set<EventListener<TDataByName, any>>
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
    listener?: EventListener<TDataByName, TName>,
  ): void {
    if (eventName != null) {
      if (listener) {
        const listeners = this.#listenersByName.get(eventName);
        if (listeners?.delete(listener) && !listeners.size) {
          this.#listenersByName.delete(eventName);
        }
      } else {
        this.#listenersByName.delete(eventName);
      }
    } else {
      this.#listenersByName.clear();
    }
  }

  /**
   * Subscribe to an event.
   * Returns a method to unsubscribe later.
   */
  public on<TName extends EventName<TDataByName>>(
    eventName: TName,
    listener: EventListener<TDataByName, TName>,
  ): BoundOff;

  /**
   * Subscribe to a bunch of events.
   * Returns an array of unsubscribe methods
   */
  public on(
    config: EventConfigByName<TDataByName> | null | undefined,
  ): BoundOff;

  /**
   * Do nothing
   */
  public on(): BoundOff;

  public on<TName extends EventName<TDataByName>>(
    ...args:
      | [TName, EventListener<TDataByName, TName>]
      | [EventConfigByName<TDataByName> | null | undefined]
      | []
  ): BoundOff {
    if (args.length === 2) {
      const [eventName, listener] = args;

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

      const wrappedListener: EventListener<TDataByName, TName> =
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

      listeners.add(wrappedListener);

      return () => this.off(eventName, wrappedListener);
    } else {
      const [maybeConfigsByName] = args;

      const offs: BoundOff[] = [];

      if (maybeConfigsByName != null) {
        if (typeof maybeConfigsByName !== 'object') {
          throw new TypeError(
            `Expects an object, got: ${inspect(maybeConfigsByName)}`,
          );
        }

        for (const eventName of [
          ...Object.getOwnPropertyNames(maybeConfigsByName),
          ...Object.getOwnPropertySymbols(maybeConfigsByName),
        ] as EventNameExcludingNumber<TDataByName>[]) {
          const configs = maybeConfigsByName[eventName];
          if (configs != null) {
            const listeners = Array.isArray(configs) ? configs : [configs];
            for (const listener of listeners) {
              if (listener != null) {
                offs.push(this.on(eventName, listener));
              }
            }
          }
        }
      }

      return () => offs.forEach((off) => off());
    }
  }

  /**
   * Subscribe to an event only once.
   * It will be unsubscribed after the first execution.
   */
  public once<TName extends EventName<TDataByName>>(
    eventName: TName,
    listener: EventListener<TDataByName, TName>,
  ): BoundOff {
    const off = this.on(eventName, async (eventData) => {
      off();

      await listener(eventData);
    });

    return off;
  }

  public async wait<TName extends EventName<TDataByName>>(
    eventName: TName,
    timeout?: number | null,
  ): Promise<EventData<TDataByName, TName>> {
    return new Promise((resolve, reject) => {
      let off: BoundOff;

      const timeoutId =
        timeout != null
          ? setTimeout(() => {
              off();

              reject(
                new Error(
                  `Has waited for the "${String(
                    eventName,
                  )}" event more than ${timeout}ms`,
                ),
              );
            }, timeout)
          : undefined;

      off = this.on(eventName, (eventData) => {
        off();
        timeoutId && clearTimeout(timeoutId);

        resolve(eventData);
      });
    });
  }

  public async race<TName extends EventName<TDataByName>>(
    eventNames: ReadonlyArray<TName>,
    timeout?: number | null,
  ): Promise<EventData<TDataByName, TName>> {
    return new Promise((resolve, reject) => {
      let offs: BoundOff[];

      const timeoutId =
        timeout != null
          ? setTimeout(() => {
              offs.forEach((off) => off());

              reject(
                new Error(
                  `Has waited for the "${eventNames
                    .map(String)
                    .join(', ')}" event(s) more than ${timeout}ms`,
                ),
              );
            }, timeout)
          : undefined;

      offs = eventNames.map((eventName) =>
        this.on(eventName, (eventData) => {
          offs.forEach((off) => off());
          timeoutId && clearTimeout(timeoutId);

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
    await Promise.all(
      this.eventListeners(eventName).map((listener) => listener(eventData)),
    );
  }
}
