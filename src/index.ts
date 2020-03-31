import { errorMonitor as nativeErrorMonitor } from 'events';
import { clearTimeout, setTimeout } from 'timers';

// Polyfill the "errorMonitor" Symbol
const errorMonitor: unique symbol = (nativeErrorMonitor ??
  Symbol('EventEmitter.errorMonitor')) as any;

export { errorMonitor };

type Maybe<T> = undefined | null | T;
type ValueOrArray<T> = T | Array<T>;
type ValueOrPromise<T> = T | Promise<T>;

/**
 * cf: https://nodejs.org/api/events.html#events_error_events
 */
export type EventEmitterEventMap = {
  error: any;

  [errorMonitor]: any;
};

export type EventMap = Record<keyof any, any>;

export type EventKind<TEventMap extends EventMap> = keyof (TEventMap &
  EventEmitterEventMap);

export type EventKindWithoutNumericEntries<
  TEventMap extends EventMap
> = Exclude<EventKind<TEventMap>, number>;

export type EventData<
  TEventMap extends EventMap,
  TEventKind extends EventKind<TEventMap> = EventKind<TEventMap>
> = (TEventMap & EventEmitterEventMap)[TEventKind];

export type EventListener<
  TEventMap extends EventMap,
  TEventKind extends EventKind<TEventMap> = EventKind<TEventMap>
> = (eventData: EventData<TEventMap, TEventKind>) => ValueOrPromise<void>;

export type EventConfig<
  TEventMap extends EventMap,
  TEventKind extends EventKind<TEventMap> = EventKind<TEventMap>
> = Maybe<ValueOrArray<Maybe<EventListener<TEventMap, TEventKind>>>>;

export type EventConfigMap<TEventMap extends EventMap> = {
  // Forbid usage of "numeric" key because javascript does not support it: they are transform into "string"
  [TEventKind in EventKindWithoutNumericEntries<TEventMap>]?: EventConfig<
    TEventMap,
    TEventKind
  >;
};

export type BoundOff = () => void;

export class EventEmitter<TEventMap extends EventMap = any> {
  protected eventListenerSetMap = new Map<
    EventKind<TEventMap>,
    Set<EventListener<TEventMap, any>>
  >();

  public constructor(config?: EventConfigMap<TEventMap> | null) {
    this.on(config);
  }

  /**
   * Unsubscribe either :
   * - one listener for a given event
   * - all listeners for a given event
   * - all listeners
   */
  public off<TEventKind extends EventKind<TEventMap>>(
    eventName?: TEventKind,
    eventListener?: EventListener<TEventMap, TEventKind>,
  ): void {
    if (typeof eventName !== 'undefined' && eventListener) {
      const eventListenerSet = this.eventListenerSetMap.get(eventName);
      if (
        eventListenerSet &&
        eventListenerSet.delete(eventListener) &&
        eventListenerSet.size === 0
      ) {
        this.eventListenerSetMap.delete(eventName);
      }
    } else if (typeof eventName !== 'undefined') {
      this.eventListenerSetMap.delete(eventName);
    } else {
      this.eventListenerSetMap.clear();
    }
  }

  /**
   * Subscribe to an event.
   * Returns a method to unsubscribe later.
   */
  public on<TEventKind extends EventKind<TEventMap>>(
    eventName: TEventKind,
    eventListener: EventListener<TEventMap, TEventKind>,
  ): BoundOff;

  /**
   * Subscribe to a bunch of events.
   * Returns an array of unsubscribe methods
   */
  public on(config: EventConfigMap<TEventMap> | null | undefined): BoundOff[];
  public on(): BoundOff[];

  public on(
    ...args:
      | [EventKind<TEventMap>, EventListener<TEventMap>]
      | [EventConfigMap<TEventMap> | null | undefined]
  ): ValueOrArray<BoundOff> {
    if (args.length === 2) {
      const [eventName, eventListener] = args;

      let eventListenerSet = this.eventListenerSetMap.get(eventName);
      if (!eventListenerSet) {
        this.eventListenerSetMap.set(eventName, (eventListenerSet = new Set()));
      }

      const eventListenerWrapper: EventListener<TEventMap, any> =
        eventName === 'error' || eventName === errorMonitor
          ? eventListener
          : async (eventData) => {
              try {
                await eventListener(eventData);
              } catch (error) {
                // cf: https://nodejs.org/api/events.html#events_error_events
                if (this.eventListenerSetMap.get(errorMonitor)?.size) {
                  await this.emit(errorMonitor, error);
                }

                if (this.eventListenerSetMap.get('error')?.size) {
                  await this.emit('error', error);
                } else {
                  throw error;
                }
              }
            };

      eventListenerSet.add(eventListenerWrapper);

      return this.off.bind(this, eventName, eventListenerWrapper);
    } else {
      const [config] = args;

      const offs: BoundOff[] = [];

      if (config != null) {
        for (const eventName of [
          ...Object.getOwnPropertyNames(config),
          ...Object.getOwnPropertySymbols(config),
        ] as EventKindWithoutNumericEntries<TEventMap>[]) {
          const eventConfig = config[eventName];
          if (eventConfig != null) {
            const eventListeners = Array.isArray(eventConfig)
              ? eventConfig
              : [eventConfig];

            for (const eventListener of eventListeners) {
              if (eventListener != null) {
                offs.push(this.on(eventName, eventListener));
              }
            }
          }
        }
      }

      return offs;
    }
  }

  /**
   * Subscribe to an event only once.
   * It will be unsubscribed after the first execution.
   */
  public once<TEventKind extends EventKind<TEventMap>>(
    eventName: TEventKind,
    eventListener: EventListener<TEventMap, TEventKind>,
  ): BoundOff {
    const off = this.on(eventName, async (eventData) => {
      off();

      await eventListener(eventData);
    });

    return off;
  }

  public async wait<TEventKind extends EventKind<TEventMap>>(
    eventName: TEventKind,
    timeout?: number | null,
  ): Promise<EventData<TEventMap, TEventKind>> {
    return new Promise((resolve, reject) => {
      let off: BoundOff;

      const timeoutId =
        timeout != null && timeout > 0
          ? setTimeout(() => {
              off && off();

              reject(
                new Error(
                  `Has waited for the "${eventName}" event more than ${timeout}ms`,
                ),
              );
            }, timeout)
          : null;

      off = this.once(eventName, (eventData) => {
        timeoutId && clearTimeout(timeoutId);

        resolve(eventData);
      });
    });
  }

  public getEventNames(): Array<EventKind<TEventMap>> {
    return [...this.eventListenerSetMap.keys()];
  }

  protected getEventListeners<TEventKind extends EventKind<TEventMap>>(
    eventName: TEventKind,
  ): Array<EventListener<TEventMap, TEventKind>> {
    const eventListenerSet = this.eventListenerSetMap.get(eventName);

    return eventListenerSet ? [...eventListenerSet] : [];
  }

  public getEventListenerCount(eventName: EventKind<TEventMap>): number {
    return this.eventListenerSetMap.get(eventName)?.size ?? 0;
  }

  /**
   * Trigger an event asynchronously with some data. Listeners are called in the order they were added, but execute concurrently.
   * Returns a promise for when all the event listeners are done. Done meaning executed if synchronous or resolved when an async/promise-returning function. You usually wouldn't want to wait for this, but you could for example catch possible errors. If any of the listeners throw/reject, the returned promise will be rejected with the error, but the other listeners will not be affected.
   */
  public async emit<TEventKind extends EventKind<TEventMap>>(
    eventName: TEventKind,
    eventData: EventData<TEventMap, TEventKind>,
  ): Promise<void> {
    await Promise.all(
      this.getEventListeners(eventName).map(async (eventListener) =>
        eventListener(eventData),
      ),
    );
  }

  /**
   * Same as above, but it waits for each listener to resolve before triggering the next one. This can be useful if your events depend on each other.
   * If any of the listeners throw/reject, the returned promise will be rejected with the error and the remaining listeners will not be called.
   */
  public async emitSerial<TEventKind extends EventKind<TEventMap>>(
    eventName: TEventKind,
    eventData: EventData<TEventMap, TEventKind>,
  ): Promise<void> {
    for (const eventListener of this.getEventListeners(eventName)) {
      await eventListener(eventData);
    }
  }
}

export default EventEmitter;
