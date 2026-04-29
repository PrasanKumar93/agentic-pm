import type { RunEvent } from "@agentic-pm/core";

export interface EventSink {
  emit(event: Omit<RunEvent, "id" | "createdAt">): Promise<void>;
}

export class ConsoleEventSink implements EventSink {
  async emit(event: Omit<RunEvent, "id" | "createdAt">): Promise<void> {
    const prefix = [event.level.toUpperCase(), event.type].join(" ");
    console.log(`${prefix}: ${event.message}`, event.payload ?? "");
  }
}

export class CompositeEventSink implements EventSink {
  constructor(private readonly sinks: EventSink[]) {}

  async emit(event: Omit<RunEvent, "id" | "createdAt">): Promise<void> {
    await Promise.all(this.sinks.map((sink) => sink.emit(event)));
  }
}
