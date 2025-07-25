# Process Manager Component

## Overview

The Process Manager component handles process spawning, lifecycle management, and monitoring for the MCP Phase 7 Universal Transport Support. It provides a robust interface for managing child processes with features like auto-restart, resource monitoring, and log capture.

## Architecture

```
src/
├── process-manager.js          # Main ProcessManager class
├── process-metrics.js          # Platform-specific metrics collection
├── process-manager-wrapper.js  # Node.js IPC wrapper for Python integration
└── process_manager_impl.py     # Python implementation of ProcessManagerContract
```

## Key Features

### 1. Process Spawning
- Spawn processes with custom commands, arguments, and environment
- Configurable working directory
- Automatic process ID generation or custom IDs
- Process limit enforcement (default: 100 processes)

### 2. Lifecycle Management
- Graceful shutdown with SIGTERM
- Force kill after timeout with SIGKILL
- Process status tracking (running, stopped, error)
- Event-based notifications (stdout, stderr, exit, error)

### 3. Resource Monitoring
- Real-time CPU usage monitoring
- Memory usage tracking
- Platform-specific implementations:
  - Linux: Uses `/proc` filesystem
  - macOS: Uses `ps` command
  - Windows: Uses `wmic` command

### 4. Auto-Restart
- Configurable auto-restart on process failure
- Retry limit (max 5 restarts)
- Won't restart on clean exit (code 0)
- Exponential backoff between restarts

### 5. Log Capture
- Captures stdout and stderr streams
- Circular buffer (last 1000 lines per stream)
- Query logs with configurable line limit

## API Reference

### ProcessManager Class

```javascript
const manager = new ProcessManager();
```

#### Methods

**spawnProcess(config)**
```javascript
const processId = manager.spawnProcess({
    id: 'my-process',         // Optional, auto-generated if not provided
    command: 'node',          // Required
    args: ['script.js'],      // Optional
    env: { NODE_ENV: 'prod' }, // Optional, merged with process.env
    workingDir: '/app',       // Optional, defaults to cwd
    autoRestart: true         // Optional, default false
});
```

**stopProcess(processId, timeout)**
```javascript
const stopped = await manager.stopProcess('my-process', 5000);
```

**getProcessStatus(processId)**
```javascript
const status = manager.getProcessStatus('my-process');
// Returns: { pid, status, uptime, cpu, memory, restarts }
```

**getProcessLogs(processId, lines)**
```javascript
const logs = manager.getProcessLogs('my-process', 100);
// Returns: { stdout: [...], stderr: [...] }
```

**listProcesses()**
```javascript
const processes = manager.listProcesses();
// Returns: [{ id, pid, status, command, uptime }, ...]
```

#### Events

- `stdout`: Emitted when process writes to stdout
- `stderr`: Emitted when process writes to stderr
- `exit`: Emitted when process exits
- `error`: Emitted on process errors
- `restart`: Emitted when process is restarted

### Python Integration

The Python implementation (`process_manager_impl.py`) implements the `ProcessManagerContract` interface and can be used directly:

```python
from process_manager_impl import ProcessManagerImpl

manager = ProcessManagerImpl()
process_id = manager.spawn_process({
    'command': 'python',
    'args': ['script.py']
})
```

## Usage Example

```javascript
const ProcessManager = require('./process-manager');
const manager = new ProcessManager();

// Listen to events
manager.on('stdout', ({ processId, data }) => {
    console.log(`[${processId}]`, data);
});

// Spawn a process
const processId = manager.spawnProcess({
    command: 'npm',
    args: ['run', 'build'],
    autoRestart: true
});

// Check status
const status = manager.getProcessStatus(processId);
console.log(`CPU: ${status.cpu}%, Memory: ${status.memory}MB`);

// Stop process
await manager.stopProcess(processId);
```

## Testing

Unit tests are provided for both JavaScript and Python implementations:

```bash
# JavaScript tests (requires Jest)
npm test tests/unit/process-manager.test.js

# Python tests
python3 tests/unit/test_process_manager_impl.py
```

## Integration

The Process Manager integrates with:
- **Transport Layer**: For stdio-based transport connections
- **API Gateway**: For managing server processes
- **Monitoring Systems**: Through event emissions and metrics

## Error Handling

- Process spawn failures are caught and emitted as 'error' events
- Metrics collection failures fall back to default values
- Process limit enforcement prevents resource exhaustion
- Graceful degradation on platform-specific feature unavailability

## Security Considerations

- Command validation to prevent injection
- Environment variable sanitization
- Process isolation through separate working directories
- Resource limits to prevent DoS

## Performance

- Efficient process tracking using Map data structure
- Asynchronous metrics collection
- Minimal overhead monitoring (5-second intervals)
- Circular log buffers to limit memory usage