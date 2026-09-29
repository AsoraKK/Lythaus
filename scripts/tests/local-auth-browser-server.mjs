import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export async function localAuthBrowserServer(handle) {
  const directory=await mkdtemp(path.join(tmpdir(),'lythaus-local-auth-tls-'));
  const keyFile=path.join(directory,'key.pem'),certFile=path.join(directory,'cert.pem');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyFile,'-out',certFile,
    '-days','1','-subj','/CN=local-auth-fixture'],{stdio:'ignore'});
  const allowed=new Set(['app.lythaus.co','api.lythaus.co','admin.lythaus.co','lythaus.co']);
  const sockets=new Set();
  const server=https.createServer({key:await readFile(keyFile),cert:await readFile(certFile)},async(req,res)=>{
    if(!allowed.has(req.headers.host)){res.writeHead(403).end();return;}
    const chunks=[];let bytes=0;
    for await(const chunk of req){bytes+=chunk.length;if(bytes>16384){res.writeHead(413).end();return;}chunks.push(chunk);}
    const body=Buffer.concat(chunks).toString();
    const request={url:()=>`https://${req.headers.host}${req.url}`,method:()=>req.method,
      allHeaders:async()=>req.headers,postData:()=>body,postDataJSON:()=>JSON.parse(body)};
    try {
      await handle({request:()=>request,abort:async()=>res.destroy(),fulfill:async({status=200,headers={},contentType,body=''})=>{
        res.writeHead(status,{...headers,...(contentType?{'content-type':contentType}:{})});res.end(body);
      }});
    }catch(error){res.writeHead(500).end('Synthetic fixture failed');throw error;}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const proxy=http.createServer((_req,res)=>res.writeHead(403).end());
  proxy.on('connect',(req,client,head)=>{
    if(!allowed.has(req.url?.split(':')[0])){client.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
    const upstream=net.connect(server.address().port,'127.0.0.1',()=>{
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if(head.length)upstream.write(head);
      client.pipe(upstream);upstream.pipe(client);
    });
    for(const socket of [client,upstream]){sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{client.destroy();upstream.destroy();});}
  });
  await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
  return {proxy:`http://127.0.0.1:${proxy.address().port}`,close:async()=>{
    for(const socket of sockets)socket.destroy();
    await Promise.all([new Promise(resolve=>proxy.close(resolve)),new Promise(resolve=>server.close(resolve))]);
    await rm(directory,{recursive:true,force:true});
  }};
}
