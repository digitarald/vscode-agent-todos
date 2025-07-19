import * as vscode from 'vscode';

// Define types to avoid importing the actual library until runtime
interface ITelemetryReporter {
    sendTelemetryEvent(eventName: string, properties?: Record<string, string>, measurements?: Record<string, number>): void;
    sendTelemetryErrorEvent(eventName: string, properties?: Record<string, string>, measurements?: Record<string, number>): void;
    dispose(): void;
}

/**
 * Centralized telemetry manager for the Agent TODOs extension.
 * Handles all telemetry operations in a privacy-preserving way.
 */
export class TelemetryManager {
    private static instance: TelemetryManager;
    private reporter: ITelemetryReporter | undefined;
    private isInitialized = false;

    private constructor() {}

    public static getInstance(): TelemetryManager {
        if (!TelemetryManager.instance) {
            TelemetryManager.instance = new TelemetryManager();
        }
        return TelemetryManager.instance;
    }

    /**
     * Initialize telemetry with Application Insights
     */
    public initialize(context: vscode.ExtensionContext): void {
        if (this.isInitialized) {
            return;
        }

        try {
            // Application Insights connection string - this would typically come from environment or configuration
            // For now using a placeholder - in real implementation this should be provided securely
            const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING || '';
            
            if (connectionString) {
                // Use require at runtime to avoid bundling issues
                try {
                    const telemetryLibrary = '@vscode/extension-telemetry';
                    const TelemetryReporter = eval('require')(telemetryLibrary).TelemetryReporter;
                    this.reporter = new TelemetryReporter(connectionString);
                    context.subscriptions.push(this.reporter as any);
                    console.log('[TelemetryManager] Telemetry initialized with Application Insights');
                } catch (requireError) {
                    console.error('[TelemetryManager] Failed to load telemetry library:', requireError);
                    this.reporter = undefined;
                }
            } else {
                console.log('[TelemetryManager] No Application Insights connection string provided, telemetry disabled');
            }
        } catch (error) {
            console.error('[TelemetryManager] Failed to initialize telemetry:', error);
            this.reporter = undefined;
        }

        this.isInitialized = true;
    }

    /**
     * Send a telemetry event
     */
    public sendEvent(eventName: string, properties?: Record<string, string>, measurements?: Record<string, number>): void {
        if (!this.reporter) {
            return;
        }

        try {
            // Ensure no sensitive data is included
            const sanitizedProperties = this.sanitizeProperties(properties);
            this.reporter.sendTelemetryEvent(eventName, sanitizedProperties, measurements);
        } catch (error) {
            console.error('[TelemetryManager] Failed to send telemetry event:', error);
        }
    }

    /**
     * Send an error telemetry event
     */
    public sendError(error: Error, properties?: Record<string, string>, measurements?: Record<string, number>): void {
        if (!this.reporter) {
            return;
        }

        try {
            const sanitizedProperties = this.sanitizeProperties(properties);
            this.reporter.sendTelemetryErrorEvent('extension.error', {
                ...sanitizedProperties,
                errorName: error.name,
                errorMessage: this.sanitizeErrorMessage(error.message)
            }, measurements);
        } catch (telemetryError) {
            console.error('[TelemetryManager] Failed to send error telemetry:', telemetryError);
        }
    }

    /**
     * Send an exception telemetry event
     */
    public sendException(error: Error, properties?: Record<string, string>, measurements?: Record<string, number>): void {
        if (!this.reporter) {
            return;
        }

        try {
            const sanitizedProperties = this.sanitizeProperties(properties);
            this.reporter.sendTelemetryErrorEvent('extension.exception', {
                ...sanitizedProperties,
                errorName: error.name,
                errorMessage: this.sanitizeErrorMessage(error.message)
            }, measurements);
        } catch (telemetryError) {
            console.error('[TelemetryManager] Failed to send exception telemetry:', telemetryError);
        }
    }

    /**
     * Dispose of telemetry resources
     */
    public dispose(): void {
        if (this.reporter) {
            this.reporter.dispose();
            this.reporter = undefined;
        }
        this.isInitialized = false;
    }

    /**
     * Check if telemetry is enabled and initialized
     */
    public isEnabled(): boolean {
        return this.isInitialized && !!this.reporter;
    }

    /**
     * Sanitize properties to ensure no sensitive data is sent
     */
    private sanitizeProperties(properties?: Record<string, string>): Record<string, string> {
        if (!properties) {
            return {};
        }

        const sanitized: Record<string, string> = {};
        for (const [key, value] of Object.entries(properties)) {
            // Remove or sanitize any potentially sensitive keys
            if (this.isSensitiveKey(key)) {
                continue;
            }
            sanitized[key] = this.sanitizeValue(value);
        }
        return sanitized;
    }

    /**
     * Check if a property key might contain sensitive data
     */
    private isSensitiveKey(key: string): boolean {
        const sensitiveKeys = [
            'content', 'text', 'description', 'details', 'adr',
            'path', 'filePath', 'workspace', 'directory',
            'password', 'token', 'key', 'secret'
        ];
        return sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive));
    }

    /**
     * Sanitize a value to remove potentially sensitive information
     */
    private sanitizeValue(value: string): string {
        if (!value || typeof value !== 'string') {
            return '';
        }

        // Limit length to prevent accidental inclusion of large content
        if (value.length > 100) {
            return value.substring(0, 100) + '...';
        }

        return value;
    }

    /**
     * Sanitize error messages to remove sensitive information
     */
    private sanitizeErrorMessage(message: string): string {
        if (!message) {
            return '';
        }

        // Remove file paths that might contain sensitive information
        let sanitized = message.replace(/\/[^\s]+/g, '[PATH]');
        sanitized = sanitized.replace(/\\[^\s]+/g, '[PATH]');
        
        // Remove potential tokens or keys
        sanitized = sanitized.replace(/[a-zA-Z0-9]{32,}/g, '[TOKEN]');
        
        return sanitized;
    }
}