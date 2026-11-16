const T=require(require('path').join(__dirname,'..','tests','shake-traces.js'));
const out={
 shake: T.render(T.shake({cycles:3,f:3.5,amp:40,axis:[1,0,0]}),{seconds:1.5,fs:60,seed:7,lead:0.6}),
 walk: T.render(T.walk({f:2.3,strike:12,swing:16}),{seconds:12,fs:60,seed:17,rot:70,rotHz:1.15,lead:0.6}),
};
// sanity: old detector at its high setting fires on this walk
let n=0;const d=T.OldDetector(30);for(const [t,x,y,z] of out.walk) if(d.push(t,x,y,z)) n++;
out.walkOldFires=n;
require('fs').writeFileSync(process.argv[2],JSON.stringify(out));
console.log('old fires on walk trace:',n, 'samples', out.walk.length);
