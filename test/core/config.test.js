import test from 'node:test';
import assert from 'node:assert';
import config from '../../server/core/config.js';

test('Core Config - setConfig partial update', () => {
	// Store original state to restore after test (singleton)
	const originalTheme = config['client.theme'];
	const originalTint = config['client.tint'];

	try {
		// Partial update: update theme only
		config.setConfig({ 'client.theme': 'dark' });
		assert.strictEqual(config['client.theme'], 'dark', 'theme should be updated to dark');
		assert.strictEqual(config['client.tint'], originalTint, 'other keys (tint) should remain unchanged');

		// Partial update: update tint only
		config.setConfig({ 'client.tint': 'pink' });
		assert.strictEqual(config['client.tint'], 'pink', 'tint should be updated to pink');
		assert.strictEqual(config['client.theme'], 'dark', 'previously updated theme should be preserved');

		// Ignore invalid keys
		config.setConfig({ 'invalid.key.name': 'some-value' });
		assert.strictEqual(config['invalid.key.name'], undefined, 'undefined keys should not be added');

	} finally {
		// Restore original state
		config.setConfig({
			'client.theme': originalTheme,
			'client.tint': originalTint,
		});
	}
});
