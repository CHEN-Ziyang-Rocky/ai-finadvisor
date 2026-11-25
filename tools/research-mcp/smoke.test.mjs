import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
test('stdio client discovers and runs both public tools',async()=>{
  const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./server.mjs',import.meta.url))]});
  const client=new Client({name:'verification',version:'1'});
  try {
    await client.connect(transport);
    const {tools}=await client.listTools();
    assert.equal(tools.length,2); assert.ok(tools.every(t=>t.annotations.readOnlyHint));
    const call=async(name,args)=>JSON.parse((await client.callTool({name,arguments:args})).content[0].text);
    assert.equal((await call('read_example_allocation',{})).scope,'public example');
    assert.equal((await call('search_research_library',{question:'Apple FY2026 revenue'})).evidence[0].id,'aapl-revenue-2026');
  } finally { await client.close(); }
});
