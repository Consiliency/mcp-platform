/**
 * Bridge Core Module
 * Exports all core bridge components
 */

const TransportInterface = require('./transport.interface');
const BridgeService = require('./bridge-service');
const MessageRouter = require('./message-router');
const TransportDetector = require('./transport-detector');

module.exports = {
    TransportInterface,
    BridgeService,
    MessageRouter,
    TransportDetector
};