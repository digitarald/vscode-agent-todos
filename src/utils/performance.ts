export class PerformanceMonitor {
    private static timers = new Map<string, number>();
    private static enabled = process.env.TODO_PERF_LOG === 'true';

    static start(label: string): void {
        if (!this.enabled) {return;}
        this.timers.set(label, Date.now());
    }

    static end(label: string, warnThreshold = 100): void {
        if (!this.enabled) {return;}
        const startTime = this.timers.get(label);
        if (!startTime) {return;}
        
        const duration = Date.now() - startTime;
        this.timers.delete(label);
        
        if (duration > warnThreshold) {
            console.warn(`[PERF] ${label}: ${duration}ms ${duration > 500 ? '⚠️' : ''}`);
        } else {
            console.log(`[PERF] ${label}: ${duration}ms`);
        }
    }

    static async measure<T>(label: string, fn: () => Promise<T>): Promise<T> {
        this.start(label);
        try {
            return await fn();
        } finally {
            this.end(label);
        }
    }
}