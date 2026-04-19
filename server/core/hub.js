import { EventEmitter } from 'node:events';

const hub = new EventEmitter();

// Send all events to wildcard events
const originalEmit = hub.emit;
hub.emit = function (type, data) {
	originalEmit.call(this, '*', { type, ...data });
	return originalEmit.call(this, type, data);
};

export default hub;
