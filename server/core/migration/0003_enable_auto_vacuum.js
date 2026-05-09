// VACUUM cannot be executed within a transaction (batch 'write' mode)
export default async db => {
	await db.client.execute('PRAGMA auto_vacuum = INCREMENTAL');
	await db.client.execute('VACUUM');
};
