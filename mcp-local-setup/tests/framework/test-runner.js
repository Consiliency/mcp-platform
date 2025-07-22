/**
 * Test Runner Framework
 * Provides unified interface for running different types of tests
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

class TestRunner {
    constructor(basePath) {
        this.basePath = basePath || process.cwd();
        this.testDir = path.join(this.basePath, 'tests');
    }

    /**
     * Run unit tests
     * @param {string} pattern - Test file pattern (e.g., "*.test.js")
     * @returns {Promise<TestResult>}
     */
    static async runUnit(pattern = '**/*.unit.test.js') {
        return this._runTests('unit', pattern);
    }

    /**
     * Run integration tests
     * @param {string} pattern - Test file pattern
     * @returns {Promise<TestResult>}
     */
    static async runIntegration(pattern = '**/*.integration.test.js') {
        return this._runTests('integration', pattern);
    }

    /**
     * Run end-to-end tests
     * @param {string} pattern - Test file pattern
     * @returns {Promise<TestResult>}
     */
    static async runE2E(pattern = '**/*.e2e.test.js') {
        return this._runTests('e2e', pattern);
    }

    /**
     * Run all tests
     * @returns {Promise<TestResult>}
     */
    static async runAll() {
        const results = await Promise.all([
            this.runUnit(),
            this.runIntegration(),
            this.runE2E()
        ]);

        return {
            passed: results.every(r => r.passed),
            total: results.reduce((sum, r) => sum + r.total, 0),
            failed: results.reduce((sum, r) => sum + r.failed, 0),
            duration: results.reduce((sum, r) => sum + r.duration, 0),
            suites: {
                unit: results[0],
                integration: results[1],
                e2e: results[2]
            }
        };
    }

    /**
     * Internal test runner
     * @private
     */
    static async _runTests(type, pattern) {
        const startTime = Date.now();
        
        return new Promise((resolve) => {
            const jest = spawn('npx', [
                'jest',
                `tests/${type}`,
                '--testMatch', pattern,
                '--json',
                '--outputFile', `test-results-${type}.json`
            ], {
                stdio: 'inherit',
                cwd: process.cwd()
            });

            jest.on('close', async (code) => {
                const duration = Date.now() - startTime;
                
                try {
                    const resultsPath = path.join(process.cwd(), `test-results-${type}.json`);
                    const results = JSON.parse(await fs.readFile(resultsPath, 'utf8'));
                    
                    resolve({
                        type,
                        passed: code === 0,
                        total: results.numTotalTests,
                        failed: results.numFailedTests,
                        duration,
                        results
                    });
                } catch (error) {
                    resolve({
                        type,
                        passed: false,
                        total: 0,
                        failed: 0,
                        duration,
                        error: error.message
                    });
                }
            });
        });
    }
}

module.exports = TestRunner;