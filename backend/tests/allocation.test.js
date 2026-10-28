const { test } = require('node:test');
const assert = require('node:assert/strict');
const { replaceAllocations } = require('../services/allocationService');

function fakePool(failInsert = false) {
    const events = [];
    const connection = {
        beginTransaction: async () => events.push('begin'),
        query: async (sql) => {
            events.push(sql.split(' ')[0]);
            if (failInsert && sql.startsWith('INSERT')) throw new Error('insert failed');
        },
        commit: async () => events.push('commit'),
        rollback: async () => events.push('rollback'),
        release: () => events.push('release'),
    };
    return { events, getConnection: async () => connection };
}

test('replace locks the user and commits all allocation rows on one connection', async () => {
    const pool = fakePool();
    await replaceAllocations(pool, 'alice', ['A', 'B'], [0.3, 0.7]);
    assert.deepEqual(pool.events, ['begin', 'SELECT', 'DELETE', 'INSERT', 'INSERT', 'commit', 'release']);
});

test('failed insertion rolls back deletion and releases connection', async () => {
    const pool = fakePool(true);
    await assert.rejects(replaceAllocations(pool, 'alice', ['A'], [1]), /insert failed/);
    assert.deepEqual(pool.events, ['begin', 'SELECT', 'DELETE', 'INSERT', 'rollback', 'release']);
});

test('invalid upstream weights never reach the database', async () => {
    const pool = fakePool();
    for (const weights of [[0.2], [-1, 2], [NaN, 1], [0.1, 0.1]]) {
        await assert.rejects(replaceAllocations(pool, 'alice', ['A', 'B'], weights));
    }
    assert.deepEqual(pool.events, []);
});
