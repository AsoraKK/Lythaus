declare module 'cloudflare:workers' {
  export interface WorkflowEvent<T> {
    payload: T;
    timestamp: number;
  }

  export interface WorkflowStep {
    do<T>(name: string, callback: () => Promise<T>): Promise<T>;
    sleep(name: string, duration: string | number): Promise<void>;
    sleepUntil(name: string, timestamp: Date | number): Promise<void>;
  }

  export abstract class WorkflowEntrypoint<Env, Params> {
    protected readonly env: Env;
    abstract run(event: WorkflowEvent<Params>, step: WorkflowStep): Promise<unknown>;
  }
}
