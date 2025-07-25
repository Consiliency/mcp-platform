/**
 * Unit tests for Process Manager
 */

const ProcessManager = require('../../src/process-manager');
const { EventEmitter } = require('events');
const { spawn } = require('child_process');

// Mock child_process
jest.mock('child_process', () => ({
    spawn: jest.fn()
}));

describe('ProcessManager', () => {
    let manager;
    let mockProcess;

    beforeEach(() => {
        // Clear all mocks
        jest.clearAllMocks();
        
        // Create mock process
        mockProcess = new EventEmitter();
        mockProcess.pid = 12345;
        mockProcess.kill = jest.fn();
        mockProcess.killed = false;
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        
        // Setup spawn mock
        spawn.mockReturnValue(mockProcess);
        
        // Create manager instance
        manager = new ProcessManager();
    });

    afterEach(() => {
        // Cleanup
        if (manager) {
            manager.cleanup();
        }
    });

    describe('spawnProcess', () => {
        it('should spawn a process with valid config', () => {
            const config = {
                id: 'test-proc',
                command: 'node',
                args: ['test.js'],
                env: { NODE_ENV: 'test' }
            };

            const processId = manager.spawnProcess(config);

            expect(processId).toBe('test-proc');
            expect(spawn).toHaveBeenCalledWith(
                'node',
                ['test.js'],
                expect.objectContaining({
                    env: expect.objectContaining({ NODE_ENV: 'test' }),
                    stdio: ['pipe', 'pipe', 'pipe']
                })
            );
        });

        it('should throw error if command is missing', () => {
            const config = {
                id: 'test-proc',
                args: ['test.js']
            };

            expect(() => manager.spawnProcess(config)).toThrow('Command is required');
        });

        it('should generate process ID if not provided', () => {
            const config = {
                command: 'node',
                args: ['test.js']
            };

            const processId = manager.spawnProcess(config);

            expect(processId).toMatch(/^proc_\d+$/);
        });

        it('should handle process limit', () => {
            // Spawn processes up to limit
            for (let i = 0; i < 100; i++) {
                manager.spawnProcess({
                    command: 'node',
                    args: [`test${i}.js`]
                });
            }

            // Should throw on next spawn
            expect(() => manager.spawnProcess({
                command: 'node',
                args: ['test101.js']
            })).toThrow('Process limit (100) exceeded');
        });

        it('should capture stdout data', () => {
            const config = {
                id: 'test-proc',
                command: 'node'
            };

            const processId = manager.spawnProcess(config);
            
            // Emit stdout data
            mockProcess.stdout.emit('data', Buffer.from('Hello World\nTest Line 2\n'));

            const logs = manager.getProcessLogs(processId);
            expect(logs.stdout).toEqual(['Hello World', 'Test Line 2']);
        });

        it('should capture stderr data', () => {
            const config = {
                id: 'test-proc',
                command: 'node'
            };

            const processId = manager.spawnProcess(config);
            
            // Emit stderr data
            mockProcess.stderr.emit('data', Buffer.from('Error occurred\nAnother error\n'));

            const logs = manager.getProcessLogs(processId);
            expect(logs.stderr).toEqual(['Error occurred', 'Another error']);
        });
    });

    describe('stopProcess', () => {
        it('should stop a running process', async () => {
            const processId = manager.spawnProcess({
                command: 'node'
            });

            // Mock process exit
            mockProcess.once = jest.fn((event, callback) => {
                if (event === 'exit') {
                    setTimeout(callback, 10);
                }
            });

            const result = await manager.stopProcess(processId);

            expect(result).toBe(true);
            expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
        });

        it('should return false for non-existent process', async () => {
            const result = await manager.stopProcess('non-existent');
            expect(result).toBe(false);
        });

        it('should force kill after timeout', async () => {
            const processId = manager.spawnProcess({
                command: 'node'
            });

            // Mock process that doesn't exit
            mockProcess.once = jest.fn();
            mockProcess.killed = false;

            const resultPromise = manager.stopProcess(processId, 100);
            
            // Wait for timeout
            await new Promise(resolve => setTimeout(resolve, 150));
            
            expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
            expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
        });
    });

    describe('getProcessStatus', () => {
        it('should return running process status', () => {
            const processId = manager.spawnProcess({
                command: 'node'
            });

            const status = manager.getProcessStatus(processId);

            expect(status).toMatchObject({
                pid: 12345,
                status: 'running',
                uptime: expect.any(Number),
                cpu: expect.any(Number),
                memory: expect.any(Number),
                restarts: 0
            });
        });

        it('should return unknown status for non-existent process', () => {
            const status = manager.getProcessStatus('non-existent');

            expect(status).toMatchObject({
                pid: 0,
                status: 'unknown',
                uptime: 0,
                cpu: 0,
                memory: 0,
                restarts: 0
            });
        });
    });

    describe('getProcessLogs', () => {
        it('should return limited number of log lines', () => {
            const processId = manager.spawnProcess({
                command: 'node'
            });

            // Add many log lines
            for (let i = 0; i < 200; i++) {
                mockProcess.stdout.emit('data', Buffer.from(`Line ${i}\n`));
            }

            const logs = manager.getProcessLogs(processId, 50);
            expect(logs.stdout).toHaveLength(50);
            expect(logs.stdout[0]).toBe('Line 150');
            expect(logs.stdout[49]).toBe('Line 199');
        });

        it('should return empty logs for non-existent process', () => {
            const logs = manager.getProcessLogs('non-existent');
            expect(logs).toEqual({ stdout: [], stderr: [] });
        });
    });

    describe('listProcesses', () => {
        it('should return all managed processes', () => {
            manager.spawnProcess({
                id: 'proc1',
                command: 'node'
            });
            manager.spawnProcess({
                id: 'proc2',
                command: 'python'
            });

            const processes = manager.listProcesses();

            expect(processes).toHaveLength(2);
            expect(processes[0]).toMatchObject({
                id: 'proc1',
                pid: 12345,
                status: 'running',
                command: 'node'
            });
            expect(processes[1]).toMatchObject({
                id: 'proc2',
                pid: 12345,
                status: 'running',
                command: 'python'
            });
        });
    });

    describe('auto-restart', () => {
        it('should restart process on failure', async () => {
            const processId = manager.spawnProcess({
                command: 'node',
                autoRestart: true
            });

            // Simulate process crash
            mockProcess.emit('exit', 1, null);

            // Wait for restart
            await new Promise(resolve => setTimeout(resolve, 1500));

            const status = manager.getProcessStatus(processId);
            expect(status.restarts).toBe(1);
        });

        it('should not restart after 5 failures', async () => {
            const processId = manager.spawnProcess({
                command: 'node',
                autoRestart: true
            });

            // Simulate multiple crashes
            for (let i = 0; i < 6; i++) {
                mockProcess.emit('exit', 1, null);
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            const status = manager.getProcessStatus(processId);
            expect(status.restarts).toBeLessThanOrEqual(5);
        });

        it('should not restart on clean exit', async () => {
            const processId = manager.spawnProcess({
                command: 'node',
                autoRestart: true
            });

            // Simulate clean exit
            mockProcess.emit('exit', 0, null);

            // Wait to ensure no restart
            await new Promise(resolve => setTimeout(resolve, 1500));

            const status = manager.getProcessStatus(processId);
            expect(status.restarts).toBe(0);
        });
    });

    describe('resource monitoring', () => {
        it('should update process metrics', async () => {
            const processId = manager.spawnProcess({
                command: 'node'
            });

            // Force metrics update
            const processInfo = manager.processes.get(processId);
            await manager.updateProcessMetrics(processId, processInfo);

            const status = manager.getProcessStatus(processId);
            expect(status.cpu).toBeGreaterThanOrEqual(0);
            expect(status.cpu).toBeLessThanOrEqual(10);
            expect(status.memory).toBeGreaterThanOrEqual(100);
            expect(status.memory).toBeLessThanOrEqual(300);
        });
    });
});