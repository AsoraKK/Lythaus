export const refreshUrl='https://api.lythaus.co/api/auth/refresh';
export const logoutUrl='https://api.lythaus.co/api/auth/logout';
export const discoverUrl='https://api.lythaus.co/api/feed/discover?limit=25';
const responses=new Map([
 [refreshUrl,{method:'POST',status:401,body:{error:{code:'SESSION_EXPIRED',message:'Synthetic signed-out fixture'}}}],
 [logoutUrl,{method:'POST',status:200,body:{state:'signed_out'}}],
 [discoverUrl,{method:'GET',status:200,body:{items:[],hasMore:false,nextCursor:null}}],
]);
export function loginFixtureResponse(url,method,preflightMethod){
 const response=responses.get(url);
 if(!response)return null;
 if(method===response.method)return response;
 if(method==='OPTIONS'&&preflightMethod===response.method)return {...response,status:200,body:null};
 return null;
}
export function expectedRefreshConsole(error,requests){
 return error.url===refreshUrl&&/^Failed to load resource:.*\b401\b/.test(error.text)
  &&requests.some(r=>r.url===refreshUrl&&r.method==='POST'&&r.status===401);
}
