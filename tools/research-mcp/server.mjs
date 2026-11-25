import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import engine from '../../backend/assistant/service.js';
import library from '../../backend/assistant/library/search.js';
import example from '../../backend/demo/example.json' with {type:'json'};

const server=new McpServer({name:'finadvisor-public-research',version:'1.0.0'});
const annotations={readOnlyHint:true,destructiveHint:false,openWorldHint:false};
const output=data=>({content:[{type:'text',text:JSON.stringify(data)}]});
server.registerTool('read_example_allocation',{
  description:'Read numerical facts from the frozen public demonstration portfolio.',inputSchema:{},annotations
},async()=>{
  const ev=await engine.execute(engine.skills.find(s=>s.id==='allocation_review'),{},example.latest_run.report);
  return output({scope:'public example',facts:ev.facts,limitations:ev.limitations,context:ev.context});
});
server.registerTool('search_research_library',{
  description:'Find public methodology and filing passages with verifiable citations.',
  inputSchema:{question:z.string().trim().min(1).max(500)},annotations
},async({question})=>output(await library.answerDocuments({question,mode:'workflow'},null)));
await server.connect(new StdioServerTransport());
