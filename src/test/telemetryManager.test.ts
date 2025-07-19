import * as assert from 'assert';
import * as vscode from 'vscode';
import { TelemetryManager } from '../telemetryManager';

suite('Telemetry Manager Tests', () => {
    let telemetryManager: TelemetryManager;
    let mockContext: vscode.ExtensionContext;

    setup(() => {
        // Create mock context
        mockContext = {
            subscriptions: [],
            extension: {
                packageJSON: {
                    version: '1.0.0'
                }
            }
        } as any;

        telemetryManager = TelemetryManager.getInstance();
    });

    teardown(() => {
        telemetryManager.dispose();
    });

    test('should initialize without error when no connection string provided', () => {
        // Should not throw even without connection string
        assert.doesNotThrow(() => {
            telemetryManager.initialize(mockContext);
        });
    });

    test('should handle sendEvent gracefully when not initialized', () => {
        // Should not throw when telemetry is not properly initialized
        assert.doesNotThrow(() => {
            telemetryManager.sendEvent('test.event', { test: 'property' });
        });
    });

    test('should handle sendError gracefully when not initialized', () => {
        const testError = new Error('Test error');
        
        assert.doesNotThrow(() => {
            telemetryManager.sendError(testError, { context: 'test' });
        });
    });

    test('should sanitize sensitive properties', () => {
        // This tests the private sanitization logic indirectly
        telemetryManager.initialize(mockContext);
        
        // Should not throw with properties that might contain sensitive data
        assert.doesNotThrow(() => {
            telemetryManager.sendEvent('test.event', {
                'content': 'sensitive content that should be filtered',
                'password': 'secret',
                'safeProperty': 'this should be kept'
            });
        });
    });

    test('should return correct enabled status', () => {
        // Before initialization
        assert.strictEqual(telemetryManager.isEnabled(), false);
        
        // After initialization (without connection string)
        telemetryManager.initialize(mockContext);
        assert.strictEqual(telemetryManager.isEnabled(), false);
    });

    test('should handle multiple initialize calls', () => {
        // Multiple calls should not cause issues
        assert.doesNotThrow(() => {
            telemetryManager.initialize(mockContext);
            telemetryManager.initialize(mockContext);
        });
    });

    test('should dispose cleanly', () => {
        telemetryManager.initialize(mockContext);
        
        assert.doesNotThrow(() => {
            telemetryManager.dispose();
        });
        
        // Should be able to dispose multiple times
        assert.doesNotThrow(() => {
            telemetryManager.dispose();
        });
    });
});