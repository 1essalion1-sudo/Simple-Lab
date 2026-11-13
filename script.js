const $=id=>document.getElementById(id);
function status(el,msg,error=false){el.textContent=msg;el.classList.toggle('error',error);el.style.display='block'}
function clearStatus(el){el.style.display='none';el.textContent=''}
function cleanName(s,fallback){return (s||'').trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').replace(/\s+/g,'-').slice(0,80)||fallback}
function humanSize(n){if(n<1024)return n+' B';if(n<1048576)return (n/1024).toFixed(1)+' KB';return (n/1048576).toFixed(2)+' MB'}
function showTool(which){const meta=which==='meta';$('metaPanel').classList.toggle('hidden',!meta);$('audioPanel').classList.toggle('hidden',meta);$('tabMeta').classList.toggle('active',meta);$('tabAudio').classList.toggle('active',!meta)}
$('tabMeta').onclick=()=>showTool('meta');$('tabAudio').onclick=()=>showTool('audio');

let imageFile=null,imageUrl=null;
$('imageInput').addEventListener('change',e=>{
 imageFile=e.target.files[0]||null;clearStatus($('metaStatus'));
 if(!imageFile)return;
 if(!/^image\/(jpeg|png|webp)$/.test(imageFile.type)){status($('metaStatus'),'Please choose a JPG, PNG or WebP image.',true);imageFile=null;return}
 imageUrl=URL.createObjectURL(imageFile);$('imageView').src=imageUrl;$('imagePreview').style.display='block';$('imageInfo').textContent=imageFile.name+' · '+humanSize(imageFile.size);$('eraseBtn').disabled=false;
});
$('eraseBtn').onclick=()=>{
 if(!imageFile)return;
 const img=new Image();
 img.onload=()=>{
  try{
   const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
   const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
   const mime=imageFile.type==='image/png'?'image/png':imageFile.type==='image/webp'?'image/webp':'image/jpeg';
   canvas.toBlob(blob=>{
    if(!blob){status($('metaStatus'),'Could not export this image. Try another file.',true);return}
    const ext=mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=cleanName(imageFile.name.replace(/\.[^.]+$/,''),'image')+'-clean.'+ext;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
    status($('metaStatus'),'Done! A clean copy was created and downloaded. Your original image was left unchanged.');
   },mime,mime==='image/jpeg'?0.94:undefined);
  }catch(e){status($('metaStatus'),'Could not process this image in the browser.',true)}
 };
 img.onerror=()=>status($('metaStatus'),'This image could not be opened.',true);img.src=imageUrl;
};
$('clearImage').onclick=()=>{imageFile=null;$('imageInput').value='';$('imageView').removeAttribute('src');$('imagePreview').style.display='none';$('imageInfo').textContent='No image selected';$('eraseBtn').disabled=true;clearStatus($('metaStatus'));if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=null};

let videoFile=null,videoUrl=null,recording=false;
$('videoInput').addEventListener('change',e=>{
 videoFile=e.target.files[0]||null;clearStatus($('audioStatus'));
 if(!videoFile)return;
 if(!videoFile.type.startsWith('video/')){status($('audioStatus'),'Please choose a video file.',true);videoFile=null;return}
 if(videoUrl)URL.revokeObjectURL(videoUrl);videoUrl=URL.createObjectURL(videoFile);
 $('videoView').src=videoUrl;$('videoPreview').style.display='block';$('videoInfo').textContent=videoFile.name+' · '+humanSize(videoFile.size);$('convertBtn').disabled=false;
});
let lameLoading=null;
function loadLame(){
 if(window.lamejs)return Promise.resolve(window.lamejs);
 if(lameLoading)return lameLoading;
 lameLoading=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js';
  script.onload=()=>window.lamejs?resolve(window.lamejs):reject(new Error('MP3 encoder did not initialize. Reload and try again.'));
  script.onerror=()=>reject(new Error('Could not load the MP3 encoder. Check your internet connection.'));
  document.head.appendChild(script);
 });
 return lameLoading;
}
function toInt16(floatData){
 const result=new Int16Array(floatData.length);
 for(let i=0;i<floatData.length;i++){
  const sample=Math.max(-1,Math.min(1,floatData[i]));
  result[i]=sample<0?sample*32768:sample*32767;
 }
 return result;
}
async function recordVideoAudioAsMP3(file){
 if(!window.MediaRecorder)throw new Error('This browser does not support audio recording. Try an updated Chrome browser.');
 const lame=await loadLame();
 const video=document.createElement('video');
 const videoObjectURL=URL.createObjectURL(file);
 video.src=videoObjectURL;
 video.width=0; video.height=0;
 video.style.cssText='position:fixed;width:0;height:0;opacity:0;pointer-events:none;left:-10000px;top:-10000px';
 video.preload='auto';
 video.playsInline=true;
 video.muted=false;
 const AudioCtx=window.AudioContext||window.webkitAudioContext;
 if(!AudioCtx)throw new Error('Web Audio is not supported by this browser.');
 const audioContext=new AudioCtx();
 let recorder=null,stream=null,source=null,destination=null;
 try{
  await new Promise((resolve,reject)=>{
   video.onloadedmetadata=resolve;
   video.onerror=()=>reject(new Error('This video format cannot be opened by your browser.'));
   video.load();
  });
  await audioContext.resume();
  source=audioContext.createMediaElementSource(video);
  destination=audioContext.createMediaStreamDestination();
  source.connect(destination);
  source.connect(audioContext.destination);
  stream=destination.stream;
  const mimeTypes=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/webm'];
  const mimeType=mimeTypes.find(type=>MediaRecorder.isTypeSupported(type));
  if(!mimeType)throw new Error('This browser cannot record an audio stream in a supported format.');
  const chunks=[];
  recorder=new MediaRecorder(stream,{mimeType});
  const recorded=new Promise((resolve,reject)=>{
   recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
   recorder.onerror=()=>reject(new Error('Browser audio recording failed.'));
   recorder.onstop=()=>resolve(new Blob(chunks,{type:mimeType}));
  });
  video.onended=()=>{if(recorder&&recorder.state!=='inactive')recorder.stop()};
  recorder.start(1000);
  await video.play();
  $('convertBtn').textContent='Extracting audio…';
  $('progressBar').style.width='8%';
  const duration=Number.isFinite(video.duration)?video.duration:0;
  const progressTimer=setInterval(()=>{
   if(duration>0)$('progressBar').style.width=Math.min(75,8+(video.currentTime/duration)*67)+'%';
  },400);
  let recordedBlob;
  try{recordedBlob=await recorded}finally{clearInterval(progressTimer)}
  if(!recordedBlob.size)throw new Error('No audio was recorded. Check that the video has an audio track.');
  $('convertBtn').textContent='Encoding MP3…';
  $('progressBar').style.width='78%';
  const audioBuffer=await audioContext.decodeAudioData(await recordedBlob.arrayBuffer());
  const channels=Math.min(2,audioBuffer.numberOfChannels);
  const encoder=new lame.Mp3Encoder(channels,audioBuffer.sampleRate,192);
  const left=toInt16(audioBuffer.getChannelData(0));
  const right=channels>1?toInt16(audioBuffer.getChannelData(1)):null;
  const mp3Chunks=[];
  const blockSize=1152*40;
  for(let i=0;i<left.length;i+=blockSize){
   const l=left.subarray(i,Math.min(i+blockSize,left.length));
   const mp3=channels>1?encoder.encodeBuffer(l,right.subarray(i,Math.min(i+blockSize,right.length))):encoder.encodeBuffer(l);
   if(mp3.length)mp3Chunks.push(new Uint8Array(mp3));
   $('progressBar').style.width=Math.min(98,78+(i/left.length)*20)+'%';
   $('convertBtn').textContent='Encoding MP3… '+Math.round((i/left.length)*100)+'%';
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  const tail=encoder.flush();
  if(tail.length)mp3Chunks.push(new Uint8Array(tail));
  return new Blob(mp3Chunks,{type:'audio/mpeg'});
 }finally{
  if(recorder&&recorder.state!=='inactive'){try{recorder.stop()}catch(e){}}
  if(stream)stream.getTracks().forEach(track=>track.stop());
  video.pause();
  video.removeAttribute('src');
  video.load();
  URL.revokeObjectURL(videoObjectURL);
  try{source&&source.disconnect()}catch(e){}
  try{destination&&destination.disconnect()}catch(e){}
  try{await audioContext.close()}catch(e){}
 }
}
$('convertBtn').onclick=async()=>{
 if(!videoFile||recording)return;
 recording=true;$('convertBtn').disabled=true;$('convertBtn').textContent='Loading audio tools…';
 clearStatus($('audioStatus'));$('progress').style.display='block';$('progressBar').style.width='0%';
 try{
  const blob=await recordVideoAudioAsMP3(videoFile);
  if(!blob.size)throw new Error('No audio was found in this video.');
  const filename=cleanName($('audioName').value,'extracted-audio')+'.mp3';
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),15000);
  $('progressBar').style.width='100%';
  status($('audioStatus'),'Finished! Downloaded '+filename+' ('+humanSize(blob.size)+').');
 }catch(err){
  status($('audioStatus'),err.message||'Conversion failed. Try another browser or a smaller video.',true);
 }finally{
  recording=false;$('convertBtn').disabled=!videoFile;$('convertBtn').textContent='Convert video to MP3';
  setTimeout(()=>$('progress').style.display='none',2200);
 }
};
$('clearVideo').onclick=()=>{if(recording)return;videoFile=null;$('videoInput').value='';$('videoView').pause();$('videoView').removeAttribute('src');$('videoView').load();$('videoPreview').style.display='none';$('videoInfo').textContent='No video selected';$('convertBtn').disabled=true;clearStatus($('audioStatus'));$('progress').style.display='none';if(videoUrl)URL.revokeObjectURL(videoUrl);videoUrl=null};
function setupDrop(zone,input){zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('drag')});zone.addEventListener('dragleave',()=>zone.classList.remove('drag'));zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('drag');const f=e.dataTransfer.files[0];if(f){const dt=new DataTransfer();dt.items.add(f);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}))}})}
setupDrop($('imageDrop'),$('imageInput'));setupDrop($('videoDrop'),$('videoInput'));