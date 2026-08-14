import { EventGraph, KeyedObject } from '../../Types';
import { spooderLog } from '../Logging';
import { buildMockStreamMessage } from '../util/ResponseUtil';
import { EventService } from './EventService';

export const TIMER_ELAPSED_NODE = 'timer_elapsed';
export const TIMER_TICK_NODE = 'timer_tick';

interface RunningTimer {
  name: string;
  durationMs: number;
  repeat: boolean;
  startedAt: number;
  timeout: ReturnType<typeof setTimeout>;
  tickIntervals: ReturnType<typeof setInterval>[];
}

interface TimerCallbackRef {
  eventName: string;
  nodeId: string;
  values: KeyedObject;
}

// Named countdowns the event graph drives explicitly, replacing timing baked into individual
// actions. Names are global, so a Start Timer in one event can drive a Timer Elapsed in
// another. State is in-memory and cleared on restart, matching EventService.recurringMessages.
export default class TimerService {
  private static timers = new Map<string, RunningTimer>();

  // Finds every callback of `nodeTypeId` across all graphs whose `name` value matches. Reads
  // the graphs directly rather than going through EventService.emitTrigger: the flat event
  // view (reconstructFlatEventFromGraph) collapses all core triggers into one `triggers.core`
  // key, so an event holding both a Timer Elapsed and a Timer Tick would lose one of them.
  private static findCallbacks(nodeTypeId: string, timerName: string): TimerCallbackRef[] {
    const graphs = EventService.getGraphs();
    const found: TimerCallbackRef[] = [];

    for (const eventName in graphs) {
      const graph: EventGraph = graphs[eventName];
      for (const node of graph.nodes ?? []) {
        if (node.kind !== 'callback' || node.moduleName !== 'core') {
          continue;
        }
        if (node.nodeTypeId !== nodeTypeId || node.values?.name !== timerName) {
          continue;
        }
        found.push({ eventName, nodeId: node.id, values: node.values ?? {} });
      }
    }
    return found;
  }

  private static fire(callback: TimerCallbackRef, payload: KeyedObject) {
    const streamMessage = buildMockStreamMessage(payload.name ?? '');
    streamMessage.platform = '';
    streamMessage.channel = '';
    // Callback output ports resolve from platformEventData - see resolveNodeValues in
    // EventGraphExecutor - so this is what makes the trigger's outputs wireable.
    streamMessage.platformEventData = payload;
    EventService.runCommandsFromNode(streamMessage, callback.eventName, callback.nodeId);
  }

  private static scheduleTicks(timer: RunningTimer) {
    // One interval per *distinct* tick period: several events can watch the same timer at the
    // same cadence without each spawning its own interval.
    const periods = new Set<number>();
    for (const callback of TimerService.findCallbacks(TIMER_TICK_NODE, timer.name)) {
      const seconds = Number(callback.values.interval);
      if (Number.isFinite(seconds) && seconds > 0) {
        periods.add(seconds);
      }
    }

    for (const seconds of periods) {
      timer.tickIntervals.push(
        setInterval(() => {
          const current = TimerService.timers.get(timer.name);
          if (!current) {
            return;
          }
          const elapsed = (Date.now() - current.startedAt) / 1000;
          for (const callback of TimerService.findCallbacks(TIMER_TICK_NODE, timer.name)) {
            if (Number(callback.values.interval) !== seconds) {
              continue;
            }
            TimerService.fire(callback, {
              name: timer.name,
              elapsed,
              remaining: Math.max(0, current.durationMs / 1000 - elapsed),
            });
          }
        }, seconds * 1000),
      );
    }
  }

  private static onElapsed(name: string) {
    const timer = TimerService.timers.get(name);
    if (!timer) {
      return;
    }

    for (const callback of TimerService.findCallbacks(TIMER_ELAPSED_NODE, name)) {
      TimerService.fire(callback, { name, elapsed: timer.durationMs / 1000, remaining: 0 });
    }

    if (!timer.repeat) {
      TimerService.stop(name);
      return;
    }
    // Repeat keeps its ticks running and just starts the next cycle.
    timer.startedAt = Date.now();
    timer.timeout = setTimeout(() => TimerService.onElapsed(name), timer.durationMs);
  }

  static start(name: string, durationSeconds: number, repeat: boolean) {
    if (!name) {
      spooderLog('Start Timer node has no timer name, ignoring.');
      return;
    }
    const seconds = Number(durationSeconds);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      spooderLog(`Timer '${name}' has an invalid duration (${durationSeconds}), ignoring.`);
      return;
    }

    // Restart rather than stack: starting a running timer resets it to a full duration.
    TimerService.stop(name);

    const timer: RunningTimer = {
      name,
      durationMs: seconds * 1000,
      repeat: Boolean(repeat),
      startedAt: Date.now(),
      timeout: setTimeout(() => TimerService.onElapsed(name), seconds * 1000),
      tickIntervals: [],
    };
    TimerService.timers.set(name, timer);
    TimerService.scheduleTicks(timer);
  }

  static stop(name: string) {
    const timer = TimerService.timers.get(name);
    if (!timer) {
      return;
    }
    clearTimeout(timer.timeout);
    timer.tickIntervals.forEach((interval) => clearInterval(interval));
    TimerService.timers.delete(name);
  }

  // Clears everything, so a reload can't leave intervals running against stale graphs.
  static stopAll() {
    for (const name of [...TimerService.timers.keys()]) {
      TimerService.stop(name);
    }
  }

  static getRunningTimers() {
    return [...TimerService.timers.values()].map((timer) => ({
      name: timer.name,
      repeat: timer.repeat,
      duration: timer.durationMs / 1000,
      remaining: Math.max(0, (timer.startedAt + timer.durationMs - Date.now()) / 1000),
    }));
  }
}
