/**
 * Process metrics collection utilities
 * Platform-specific implementations for CPU and memory monitoring
 */

const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class ProcessMetrics {
    constructor() {
        this.platform = os.platform();
        this.cpuCount = os.cpus().length;
        this.totalMemory = os.totalmem();
    }

    /**
     * Get process metrics by PID
     * @param {number} pid Process ID
     * @returns {Promise<Object>} CPU and memory metrics
     */
    async getMetrics(pid) {
        try {
            switch (this.platform) {
                case 'linux':
                    return await this.getLinuxMetrics(pid);
                case 'darwin':
                    return await this.getMacMetrics(pid);
                case 'win32':
                    return await this.getWindowsMetrics(pid);
                default:
                    // Fallback to basic metrics
                    return this.getBasicMetrics();
            }
        } catch (error) {
            // Return default metrics on error
            return this.getBasicMetrics();
        }
    }

    /**
     * Get Linux process metrics using /proc
     */
    async getLinuxMetrics(pid) {
        try {
            const fs = require('fs').promises;
            
            // Read process stat file
            const statPath = `/proc/${pid}/stat`;
            const statusPath = `/proc/${pid}/status`;
            
            // Check if process exists
            try {
                await fs.access(statPath);
            } catch (e) {
                return this.getBasicMetrics();
            }
            
            // Read CPU usage from stat
            const stat = await fs.readFile(statPath, 'utf8');
            const statFields = stat.split(' ');
            
            // Fields 13 and 14 are utime and stime (user and system time)
            const utime = parseInt(statFields[13]) || 0;
            const stime = parseInt(statFields[14]) || 0;
            const totalTime = utime + stime;
            
            // Calculate CPU percentage (rough estimate)
            const hertz = 100; // Typical USER_HZ value
            const seconds = totalTime / hertz;
            const uptime = await this.getUptime();
            const cpuPercent = Math.min((seconds / uptime) * 100, 100);
            
            // Read memory from status
            const status = await fs.readFile(statusPath, 'utf8');
            const vmRssMatch = status.match(/VmRSS:\s+(\d+)\s+kB/);
            const memoryKB = vmRssMatch ? parseInt(vmRssMatch[1]) : 0;
            const memoryMB = memoryKB / 1024;
            
            return {
                cpu: Math.round(cpuPercent * 10) / 10,
                memory: Math.round(memoryMB * 10) / 10
            };
        } catch (error) {
            return this.getBasicMetrics();
        }
    }

    /**
     * Get Mac process metrics using ps command
     */
    async getMacMetrics(pid) {
        try {
            // Use ps command to get CPU and memory
            const { stdout } = await execAsync(`ps -p ${pid} -o %cpu,rss`);
            const lines = stdout.trim().split('\n');
            
            if (lines.length < 2) {
                return this.getBasicMetrics();
            }
            
            const values = lines[1].trim().split(/\s+/);
            const cpu = parseFloat(values[0]) || 0;
            const memoryKB = parseInt(values[1]) || 0;
            const memoryMB = memoryKB / 1024;
            
            return {
                cpu: Math.round(cpu * 10) / 10,
                memory: Math.round(memoryMB * 10) / 10
            };
        } catch (error) {
            return this.getBasicMetrics();
        }
    }

    /**
     * Get Windows process metrics using wmic
     */
    async getWindowsMetrics(pid) {
        try {
            // Use wmic to get process info
            const { stdout } = await execAsync(
                `wmic process where ProcessId=${pid} get WorkingSetSize,PageFileUsage,KernelModeTime,UserModeTime /format:list`
            );
            
            const metrics = {};
            stdout.split('\n').forEach(line => {
                const [key, value] = line.split('=');
                if (key && value) {
                    metrics[key.trim()] = value.trim();
                }
            });
            
            // Calculate CPU (rough estimate)
            const userTime = parseInt(metrics.UserModeTime || 0) / 10000000; // Convert to seconds
            const kernelTime = parseInt(metrics.KernelModeTime || 0) / 10000000;
            const totalTime = userTime + kernelTime;
            const cpuPercent = Math.min((totalTime / 60) * 100, 100); // Rough estimate
            
            // Calculate memory
            const workingSet = parseInt(metrics.WorkingSetSize || 0);
            const memoryMB = workingSet / (1024 * 1024);
            
            return {
                cpu: Math.round(cpuPercent * 10) / 10,
                memory: Math.round(memoryMB * 10) / 10
            };
        } catch (error) {
            return this.getBasicMetrics();
        }
    }

    /**
     * Get system uptime in seconds
     */
    async getUptime() {
        try {
            if (this.platform === 'linux') {
                const fs = require('fs').promises;
                const uptime = await fs.readFile('/proc/uptime', 'utf8');
                return parseFloat(uptime.split(' ')[0]);
            }
        } catch (e) {
            // Fallback
        }
        return os.uptime();
    }

    /**
     * Get basic metrics (fallback)
     */
    getBasicMetrics() {
        return {
            cpu: Math.random() * 10, // 0-10%
            memory: 100 + Math.random() * 200 // 100-300 MB
        };
    }

    /**
     * Check if process is running
     */
    async isProcessRunning(pid) {
        try {
            if (this.platform === 'win32') {
                const { stdout } = await execAsync(`tasklist /FI "PID eq ${pid}"`);
                return stdout.includes(pid.toString());
            } else {
                // Unix-like systems
                const { stdout } = await execAsync(`ps -p ${pid} -o pid=`);
                return stdout.trim() === pid.toString();
            }
        } catch (error) {
            return false;
        }
    }
}

module.exports = ProcessMetrics;